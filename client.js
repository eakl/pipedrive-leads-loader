'use strict'

const P = require('bluebird')

function getClient (lib, endpoint) {
  const pipedrive = new lib.Client(process.env.PIPEDRIVE_PROD, { strictMode: true })
  return P.promisifyAll(pipedrive[endpoint])
}

module.exports = {
  getClient
}
