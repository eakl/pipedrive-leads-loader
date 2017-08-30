'use strict'

const Pipedrive = require('pipedrive')
const Path = require('path')
const Moment = require('moment')
const Argv = require('minimist')(process.argv.slice(2))

const { getCountry } = require('./country')
const {
  readCsv,
  getOwnerIds,
  inverseMap,
  flatten,
  sendEmail } = require('./lib')
const { getClient } = require('./client')

const leadsClient = getClient(Pipedrive, 'Persons')
const ownersClient = getClient(Pipedrive, 'Users')

const repsConfig = require('./representatives.json')

const run = async () => {
  const file = 'tw-leads.csv'
  const test = Argv['test']
  const force = Argv['force']

  if (test && !force) {
    console.log('Mode: dry-run')
    const leads = await getLeads(file)
    console.log(`
      Leads: ${JSON.stringify(leads.leads, null, 2)}
      Existing Leads: ${JSON.stringify(leads.nbExisting, null, 2)}
      Fresh Leads: ${JSON.stringify(leads.nbFresh, null, 2)}
      New Leads: ${JSON.stringify(leads.nbNew, null, 2)}
      Missing Timezones: ${JSON.stringify(leads.missingTimeZone, null, 2)}
    `)
  } else if (force && !test) {
    console.log('Mode: run')
    const leads = await getLeads(file)
    await loadLeads(leadsClient, leads)
    await buildMail(leads.missingTimeZone)
  } else if ((test && force) || !(test && force)) {
    Usage('Wrong command. --test or --force are required (not at the same time)')
  }
}

run()

function Usage (msg) {
  console.log(`
  Error: ${msg}

  Usage:
    --test                    dry-run
    --force                   load the leads
  `)
  process.exit(1)
}

async function removeDuplicates (client, leads) {
  const ownerId = Object.keys(leads)

  const data = {
    leads: { },
    nbExisting: { },
    nbFresh: { },
    nbNew: { }
  }

  for (let id of ownerId) {
    let MORE = true
    let START = 0
    const LIMIT = 500
    const existingLeads = [ ]

    while (MORE) {
      const leads = await client.getAllAsync({ user_id: id, start: START, limit: LIMIT })

      if (leads.length === 0) {
        MORE = false
        break
      }

      existingLeads.push(...leads)
      START += leads.length
    }

    const existingLeadsMap = existingLeads.reduce((acc, x) => {
      const mainEmail = x.email.find(c => c.primary)
      if (!acc[mainEmail.value]) {
        acc[mainEmail.value] = 0
      }
      return acc
    }, {})

    const freshLeads = leads[id].filter(l => {
      return !(l.email in existingLeadsMap)
    })

    const newLeads = { }

    freshLeads.forEach(l => {
      if (!newLeads[l.email]) {
        newLeads[l.email] = l
      }
    })

    data.leads[id] = Object.keys(newLeads).map(x => newLeads[x])
    data.nbExisting[id] = existingLeads.length
    data.nbFresh[id] = freshLeads.length
    data.nbNew[id] = Object.keys(newLeads).length
  }

  data.nbExisting.total = Object.keys(data.nbExisting).reduce((acc, x) => {
    acc += data.nbExisting[x]
    return acc
  }, 0)

  data.nbFresh.total = Object.keys(data.nbFresh).reduce((acc, x) => {
    acc += data.nbFresh[x]
    return acc
  }, 0)

  data.nbNew.total = Object.keys(data.nbNew).reduce((acc, x) => {
    acc += data.nbNew[x]
    return acc
  }, 0)

  return data
}

function formatLead (lead, { country, ownerId, ownerEmail }) {
  const data = {
    'c66af873f96d1b9db72d426899696ad759941896': Moment().format('MMM D, YYYY'), // RunningDate
    '2894b499af3fada4a0b68cb67382162a1d87cb2f': country.name, // Country
    'name': lead['ownerName'], // Lead name
    'email': lead['ownerEmail'], // Lead email
    '2a67216c87cf4361f70752148a7457ab92ea0a6b': lead['workspaceDisplayName'], // Workspace_DisplayName
    '6cb9b0ae658a087530c9148bffe9190d579c7db7': lead['workspaceCreatedDate'], // Workspace_CreatedDate
    '5d3804274433044f69bf34f44cec9f018d83f4a9': lead['membersCount'], // Workspace_ActiveMembers
    'a6c34a1a52308156478be5b5ae70f668ed500afc': lead['countryCode'], // CountryCode
    'db8d0ec2fa5a9fbb5696523762ba730f8436a95a': lead['ownerName'], // OwnerName
    'ce4bf371261d9f7cbd68628a3d6b831d61892c8f': lead['ownerEmail'], // OwnerEmail
    '48a99d0b65a4756bd5f3cfa502bf123a1246cf7e': lead['ownerTimezone'], // OwnerTimeZone
    '7add4b00a85b16ca79f4c5460243c88cc34c8c6a': lead['ownerLanguage'], // OwnerLanguage
    '7388378744c5ab7962bd8df73669a919804b7064': lead['ownerPhone'], // OwnerPhone
    '40f507ebb5441b34bcdf9867a225d14d8cae12d2': 0, // ProjectsCreated
    'f2bed590171d43972af990700440567da3ba1ccf': 0, // TasksCreated
    '3baef69c4ee644ab7bc5757b868c178af1434232': 0, // Comments
    '793a4c33f1b1184b08bb319983dc006ca0c66248': 0, // ChatMessages
    'owner_id': ownerId // Representative Id
  }

  return data
}

async function getLeads (file) {
  console.log('Reading leads CSV.')
  const _leads = await readCsv(file)

  const ownerIds = await getOwnerIds(ownersClient)
  const countries = inverseMap(repsConfig, ownerIds)

  const missingTimeZone = new Set()

  console.log('Formating leads.')
  const leadsProFrorma = _leads.map(x => {
    const country = getCountry(x)
    missingTimeZone.add(country.missing)
    const ownerId = countries[country.code] ? countries[country.code]['ownerId'] : countries['OTHER']['ownerId']
    return formatLead(x, { country, ownerId })
  })

  if (missingTimeZone.has(null)) {
    missingTimeZone.delete(null)
  }

  const leadsPerOwner = Object.values(ownerIds).reduce((acc, id) => {
    acc[id] = leadsProFrorma.filter(lead => lead['owner_id'] === id)
    return acc
  }, {})

  console.log('Removing duplicates.')
  const { leads, nbExisting, nbFresh, nbNew } = await removeDuplicates(leadsClient, leadsPerOwner)

  return {
    leads,
    missingTimeZone: [...missingTimeZone],
    nbExisting,
    nbFresh,
    nbNew
  }
}

async function loadLeads (client, leads) {
  console.log('Adding leads to pipedrive')
  const res = await pushLead(client, leads.leads)

  console.log('Leads Ids added:', res)
  console.log('\nMissing Timezones:', [ ...leads.missingTimeZone ])
}

async function pushLead (client, data) {
  const _leads = [ ]
  const ids = Object.keys(data)
  ids.forEach(id => _leads.push(data[id]))
  const leads = flatten(_leads)

  let res = []
  let count = 0

  if (leads.length > 1) {
    for (let lead of leads) {
      const prospect = await client.addAsync(lead)
      res.push(prospect.id)

      count += 1

      if ((count % 100) === 0) {
        console.log(`Leads uploaded: ${count}`)
      }
    }
  } else {
    const prospect = await client.addAsync(leads)
    res.push(prospect.id)
  }
  return res
}

async function buildMail (missing) {
  if (missing.length !== 0) {
    const missingTz = missing.map(tz => '- ' + tz)
    const emailTimeZone = {
      from: 'reports@taskworld.com',
      to: 'recipient@taskworld.com',
      subject: 'Missing time zones to be resolved.',
      content: 'The missing time zones that need to be resolved are:\n' + missingTz.join('\n')
    }
    await sendEmail(emailTimeZone)
  }
}
