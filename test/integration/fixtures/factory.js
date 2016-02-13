'use strict'

var assign = require('101/assign')
var defaults = require('101/defaults')
var isFunction = require('101/is-function')
var mongoose = require('mongoose')
var uuid = require('uuid')

var Build = require('models/mongo/build.js')
var Context = require('models/mongo/context.js')
var ContextVersion = require('models/mongo/context-version.js')
var InfraCodeVersion = require('models/mongo/infra-code-version.js')
var Instance = require('models/mongo/instance.js')
var ObjectId = mongoose.Types.ObjectId
var User = require('models/mongo/user.js')

module.exports = {
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
  createInstance: function (ownerGithubId, build, locked, cv, cb) {
    var data = this.instanceTemplate(ownerGithubId, build, locked, cv)
    Instance.create(data, cb)
  },
  createBuild: function (ownerGithubId, cv, cb) {
    var data = this.buildTemplate(ownerGithubId, cv)
    Build.create(data, cb)
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
      props.build
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
      InfraCodeVersion.create({ context: context._id}, cb)
    })
  },
  createInfraCodeVersion: function ( props, cb) {
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
  cvTemplate: function (ownerGithubId, buildExtend) {
    var cv = {
      infraCodeVersion: new ObjectId(),
      createdBy: {
        github: ownerGithubId
      },
      context: new ObjectId(),
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
      }, buildExtend);
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
  instanceTemplate: function (ownerGithubId, build, locked, cv) {
    var name = uuid()
    return {
      shortHash: uuid(),
      name: name,
      lowerName: name.toLowerCase(),
      owner: {
        github: ownerGithubId
      },
      createdBy: {
        github: ownerGithubId
      },
      parent: 'sdf',
      build: build._id,
      contextVersion: cv,
      locked: locked,
      created: new Date(),
      env: [],
      network: {
        hostIp: '127.0.0.1'
      }
    }
  }
}
