'use strict'

const timeZones = require('moment-timezone/data/meta/latest.json')
const { missings } = require('./missings')
const { extensions } = require('./extensions')
const { languages } = require('./languages')

function getCountry (row) {
  let code
  let missing

  code = missing = languageToCountry(row['ownerLanguage'])

  if (!code) {
    code = timeZoneToCountry(row['ownerTimezone'])
    missing = code || missing

    if (!code || code === 'OTHER') {
      code = extensionToCountry(row['ownerEmail'])
      missing = code || missing
    }
  }

  const countryCode = code || missing

  return {
    name: (countryCode && countryCode !== 'OTHER') ? timeZones['countries'][countryCode]['name'] : null,
    code: (countryCode && countryCode !== 'OTHER') ? timeZones['countries'][countryCode]['abbr'] : null,
    missing: !countryCode ? row['ownerTimezone'] : null
  }
}

function timeZoneToCountry (tz) {
  if (timeZones['zones'][tz]) {
    const countryCode = timeZones['zones'][tz]['countries'][0]
    return timeZones['countries'][countryCode]['abbr']
  } else if (missings[tz]) {
    return missings[tz]
  } else {
    return null
  }
}

function languageToCountry (lang) {
  return languages[lang] ? languages[lang] : null
}

function extensionToCountry (email) {
  const domain = email.split('@')
  if (domain.length !== 2) {
    return null
  }
  const extension = domain[1].split('.').pop()
  return extensions[extension] ? extensions[extension] : null
}

module.exports = {
  getCountry
}
