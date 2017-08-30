'use strict'

const Fs = require('fs')
const Zlib = require('zlib')
const Csv = require('fast-csv')
const AWS = require('aws-sdk')
const Assert = require('assert')
const Helper = require('sendgrid').mail

Assert(process.env.PIPEDRIVE_S3_KEY, 'Missing env `PIPEDRIVE_S3_KEY`')
Assert(process.env.PIPEDRIVE_S3_SECRET, 'Missing env `PIPEDRIVE_S3_SECRET`')

async function readCsv (file) {
  const s3 = new AWS.S3({
    accessKeyId: process.env.PIPEDRIVE_S3_KEY,
    secretAccessKey: process.env.PIPEDRIVE_S3_SECRET
  })

  const params = {
    Bucket: 'tw-react-prod',
    Key: 'tw-leads/tw-leads.csv'
  }

  return new Promise((resolve, reject) => {
    s3.getObject(params, (err, data) => {
      if (!err) {
        const path = '/tmp/tw-leads.csv'
        const unzipBuffer = Zlib.unzipSync(data.Body)
        Fs.writeFileSync(path, unzipBuffer, 'utf-8')

        const readStream = Fs.createReadStream(path)
        const rows = []
        const csvStream = Csv({
          objectMode: true,
          headers: true
        })
        .on('error', (err) => {
          console.error(err)
          reject(err)
        })
        .on('data', (data) => {
          rows.push(data)
        })
        .on('end', () => {
          return resolve(rows)
        })

        readStream.pipe(csvStream)
      } else {
        console.log(err)
      }
    })
  })
}

async function getOwnerIds (client) {
  const owners = await client.getAllAsync({})
  return owners.reduce((acc, x) => {
    const email = x['email']
    acc[email] = x['id']
    return acc
  }, {})
}

function inverseMap (map, ids) {
  const keys = Object.keys(map)
  const iMap = { }

  // Inverse the map (from email->countries to countries->email)
  keys.forEach(k => {
    return map[k].reduce((acc, x) => {
      acc[x] = {
        ownerEmail: k,
        ownerId: ids[k]
      }
      return acc
    }, iMap)
  })

  return iMap
}

function flatten (arr) {
  return Array.isArray(arr) ? [].concat(...arr.map(flatten)) : arr
}

async function sendEmail (opt = { }) {
  const Sg = require('sendgrid')(process.env.SENDGRID_API_KEY)

  const fromEmail = new Helper.Email(opt.from)
  const toEmail = new Helper.Email(opt.to)
  const subject = opt.subject || 'Some Subject (That’s Missing).'
  const content = new Helper.Content('text/plain', opt.content || 'Some Content (That’s Missing).')
  const mail = new Helper.Mail(fromEmail, subject, toEmail, content)

  const request = Sg.emptyRequest({
    method: 'POST',
    path: '/v3/mail/send',
    body: mail.toJSON()
  })

  console.log(`
  Sending missing timezones
  To:          ${request.body.personalizations[0].to[0].email}
  Subject:     ${request.body.subject}
  Content:     ${request.body.content[0].value}
  `)
  Sg.API(request)
}

module.exports = {
  readCsv,
  getOwnerIds,
  inverseMap,
  flatten,
  sendEmail
}
