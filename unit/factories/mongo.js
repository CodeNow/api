'use strict'

var Hashids = require('hashids')

var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')

var VALID_GITHUB_ID = 1
var VALID_OBJECT_ID = '507c7f79bcf86cd7994f6c0e'

var id = 0
function getNextId () {
  id++
  return id
}
function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH)
  return hashids.encrypt(getNextId()).toLowerCase()
}

var factory = module.exports = {
  createNewVersion: function (opts) {
    return new ContextVersion({
      message: 'test',
      owner: { github: VALID_GITHUB_ID },
      createdBy: { github: VALID_GITHUB_ID },
      config: VALID_OBJECT_ID,
      created: Date.now(),
      context: VALID_OBJECT_ID,
      dockRemoved: opts.dockRemoved,
      files: [{
        Key: 'test',
        ETag: 'test',
        VersionId: VALID_OBJECT_ID
      }],
      build: {
        dockerImage: 'testing',
        dockerTag: 'adsgasdfgasdf'
      },
      appCodeVersions: [
        {
          additionalRepo: false,
          repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
          lowerRepo: opts.repo || 'bkendall/flaming-octo-nemisis._',
          branch: opts.branch || 'master',
          defaultBranch: opts.defaultBranch || 'master',
          commit: 'deadbeef'
        },
        {
          additionalRepo: true,
          commit: '4dd22d12b4b3b846c2e2bbe454b89cb5be68f71d',
          branch: 'master',
          lowerBranch: 'master',
          repo: 'Nathan219/yash-node',
          lowerRepo: 'nathan219/yash-node',
          _id: '5575f6c43074151a000e8e27',
          privateKey: 'Nathan219/yash-node.key',
          publicKey: 'Nathan219/yash-node.key.pub',
          defaultBranch: 'master',
          transformRules: { rename: [], replace: [], exclude: [] }
        }
      ]
    })
  },

  createNewInstance: function (name, opts) {
    // jshint maxcomplexity:10
    opts = opts || {}
    var container = {
      dockerContainer: opts.containerId || VALID_OBJECT_ID,
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
        },
        NetworkSettings: {
          IPAddress: opts.IPAddress || '172.17.14.2'
        }
      }
    }
    return new Instance({
      name: name || 'name',
      shortHash: getNextHash(),
      locked: opts.locked || false,
      'public': false,
      masterPod: opts.masterPod || false,
      parent: opts.parent,
      autoForked: opts.autoForked || false,
      owner: { github: VALID_GITHUB_ID },
      createdBy: { github: VALID_GITHUB_ID },
      build: opts.build || VALID_OBJECT_ID,
      created: Date.now(),
      contextVersion: opts.contextVersion || factory.createNewVersion(opts),
      container: container,
      containers: [],
      network: {
        hostIp: '1.1.1.100'
      },
      imagePull: opts.imagePull || null
    })
  }

}
