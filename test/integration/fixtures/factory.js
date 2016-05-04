'use strict'

var assign = require('101/assign')
var defaults = require('101/defaults')
var isFunction = require('101/is-function')
var mongoose = require('mongoose')
var uuid = require('uuid')
var Hashids = require('hashids')
var createCount = require('callback-count')
var isObject = require('101/is-object')

var Build = require('models/mongo/build.js')
var Context = require('models/mongo/context.js')
var ContextVersion = require('models/mongo/context-version.js')
var InfraCodeVersion = require('models/mongo/infra-code-version.js')
var Instance = require('models/mongo/instance.js')
var ObjectId = mongoose.Types.ObjectId
var User = require('models/mongo/user.js')

var VALID_GITHUB_ID = 1
var VALID_OBJECT_ID = '507c7f79bcf86cd7994f6c0e'
var id = 0

var factory = module.exports = {
  createUser: function (id, cb) {
    User.create({
      email: 'hello@runnable.com',
      accounts: {
        github: {
          id: id,
          accessToken: uuid(),
          username: uuid(),
          emails: [
            'hello@runnable.com'
          ]
        }
      }
    }, cb)
  },
  createInstanceWithProps: function (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props
      props = null
    }
    var count = createCount(1, function () {
      var data = factory.instanceTemplate(ownerGithubId, props)
      Instance.create(data, function (err, instance) {
        if (err) { return cb(err) }
        cb(null, instance, props.build, props.cv)
      })
    })
    if (!props.build) {
      count.inc()
      factory.createBuild(ownerGithubId, props.cv, function (err, build, cv) {
        if (err) { return count.next(err) }
        props.build = build
        props.cv = cv
        count.next()
      })
    }
    count.next()
  },
  createInstance: function (ownerGithubId, build, locked, cv, cb) {
    var data = this.instanceTemplate(ownerGithubId, {
      build: build,
      cv: cv,
      locked: locked
    })
    Instance.create(data, cb)
  },
  createBuild: function (ownerGithubId, cv, cb) {
    if (isFunction(cv)) {
      cb = cv
      cv = null
    }
    var count = createCount(1, function () {
      var data = factory.buildTemplate(ownerGithubId, cv)
      Build.create(data, function (err, build) {
        if (err) { return cb(err) }
        cb(null, build, cv)
      })
    })
    if (!cv) {
      count.inc()
      factory.createStartedCv(ownerGithubId, function (err, newCv) {
        if (err) { return count.next(err) }
        cv = newCv
        count.next()
      })
    }
    count.next()
  },
  createCompletedCv: function (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props
      props = null
    }
    props = props || {build: {}}
    defaults(props.build, {
      _id: '012345678901234567890123',
      hash: uuid(),
      started: new Date(new Date() - 60 * 1000),
      completed: new Date(),
      triggeredAction: {
        manual: false
      },
      dockerContainer: 'ab3e77401fd9d32869714235e3b4041f323437206b65da225a8605fc75ccb713'
    })
    var data = this.cvTemplate(
      ownerGithubId,
      props.build
    )
    ContextVersion.create(data, cb)
  },
  createStartedCv: function (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props
      props = null
    }
    props = props || { build: {} }
    defaults(props.build, {
      _id: '012345678901234567890123',
      hash: uuid(),
      started: new Date(),
      dockerContainer: 'ab3e77401fd9d32869714235e3b4041f323437206b65da225a8605fc75ccb713'
    })
    var data = this.cvTemplate(
      ownerGithubId,
      props.build,
      props
    )
    ContextVersion.create(data, cb)
  },
  createSourceInfraCodeVersion: function (cb) {
    Context.create({
      name: 'asdasd',
      owner: {
        github: process.env.HELLO_RUNNABLE_GITHUB_ID,
        isSource: true
      }
    }, function (err, context) {
      if (err) { return cb(err) }
      InfraCodeVersion.create({ context: context._id }, cb)
    })
  },
  createInfraCodeVersion: function (props, cb) {
    if (isFunction(props)) {
      cb = props
      props = null
    }
    props = props || { }
    if (!props.parent) {
      this.createSourceInfraCodeVersion(function (err, sIcv) {
        if (err) { return cb(err) }
        props.parent = sIcv._id
        props.edited = true
        InfraCodeVersion.create(props, cb)
      })
    }
  },
  createCv: function (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props
      props = null
    }
    var data = this.cvTemplate(
      ownerGithubId
    )
    ContextVersion.create(data, cb)
  },
  cvTemplate: function (ownerGithubId, buildExtend, opts) {
    opts = opts || {}
    var cv = {
      infraCodeVersion: new ObjectId(),
      createdBy: {
        github: ownerGithubId
      },
      context: opts.context || new ObjectId(),
      owner: {
        github: ownerGithubId
      },
      advanced: true,
      appCodeVersions: [],
      __v: 0,
      dockerHost: 'http://127.0.0.1:4242'
    }
    if (buildExtend) {
      cv.build = assign({
        triggeredAction: {
          manual: true
        },
        _id: new ObjectId(),
        triggeredBy: {
          github: ownerGithubId
        },
        started: new Date(),
        hash: 'abcdef',
        network: {
          hostIp: '127.0.0.1'
        },
        dockerContainer: 'ab3e77401fd9d32869714235e3b4041f323437206b65da225a8605fc75ccb713'
      }, buildExtend)
      cv.created = new Date(cv.build.started - 60 * 1000)
    }
    if (buildExtend && buildExtend.completed) {
      assign(cv.build, {
        dockerTag: 'registry.runnable.com/544628/123456789012345678901234:12345678902345678901234',
        dockerImage: 'bbbd03498dab',
        completed: buildExtend.completed
      })
    }
    return cv
  },
  buildTemplate: function (ownerGithubId, cv) {
    var completed = new Date()
    var started = new Date(completed - 60 * 1000)
    return {
      buildNumber: 1,
      disabled: false,
      contexts: [cv.context],
      contextVersions: [cv._id],
      completed: completed,
      created: new Date(started - 60 * 1000),
      started: started,
      createdBy: {
        github: ownerGithubId
      },
      context: new ObjectId(),
      owner: {
        github: ownerGithubId
      }
    }
  },
  instanceTemplate: function (ownerGithubId, props) {
    var name = props.name || uuid()
    var shortHash = uuid()
    if (props.isolated && !isObject(props.isolated)) {
      props.isolated = VALID_OBJECT_ID
    }
    return {
      shortHash: shortHash.slice(0, shortHash.indexOf('-')),
      name: name,
      lowerName: name.toLowerCase(),
      owner: {
        github: ownerGithubId,
        username: props.username || ownerGithubId.toString()
      },
      createdBy: {
        github: ownerGithubId,
        username: props.username || ownerGithubId.toString()
      },
      isolated: props.isolated,
      isIsolationGroupMaster: props.isIsolationGroupMaster,
      parent: 'sdf',
      build: props.build._id,
      contextVersion: props.cv,
      locked: props.locked,
      created: new Date(),
      masterPod: props.masterPod || false,
      env: props.env || [],
      network: {
        hostIp: '127.0.0.1'
      }
    }
  },
  getNextId: function () {
    id++
    return id
  },
  getNextHash: function () {
    var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH)
    return hashids.encrypt(factory.getNextId()).toLowerCase()
  },
  createNewVersion: function (opts) {
    opts = opts || {}
    if (!opts.context) {
      var context = Context.create({
        name: 'asdasd',
        owner: {
          github: process.env.HELLO_RUNNABLE_GITHUB_ID,
          isSource: true
        }
      })
      opts.context = context._id
    }
    return new ContextVersion({
      message: 'test',
      owner: { github: VALID_GITHUB_ID },
      createdBy: { github: VALID_GITHUB_ID },
      config: VALID_OBJECT_ID,
      created: Date.now(),
      context: VALID_OBJECT_ID,
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
    // jshint maxcomplexity:12
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
      shortHash: factory.getNextHash(),
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
