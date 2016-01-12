'use strict'

var validation = require('../fixtures/validation')(null)

var contextVersionFactory = require('./context-version')
var Hashids = require('hashids')

var Instance = require('models/mongo/instance')

module.exports = function (name, opts) {
  opts = opts || {}
  return new Instance({
    name: name || 'name',
    shortHash: getNextHash(),
    locked: opts.locked || false,
    'public': false,
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    build: validation.VALID_OBJECT_ID,
    created: Date.now(),
    contextVersion: contextVersionFactory(opts),
    container: {
      dockerContainer: opts.containerId || validation.VALID_OBJECT_ID,
      dockerHost: opts.dockerHost || 'http://localhost:4243',
      inspect: {
        State: {
          ExitCode: 0,
          FinishedAt: '0001-01-01T00:00:00Z',
          Paused: false,
          Pid: 889,
          Restarting: false,
          Running: true,
          StartedAt: '2014-11-25T22:29:50.23925175Z'
        }
      }
    },
    containers: [],
    network: {
      networkIp: '1.1.1.1',
      hostIp: '1.1.1.100'
    }
  })
}

var id = 0
function getNextId () {
  return ++id
}

function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH)
  return hashids.encrypt(getNextId())[0]
}
