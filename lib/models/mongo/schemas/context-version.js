/**
 * @module models/schemas/context-version
 */
'use strict'

/**
 * Versions of a Context!
 */
var extend = require('extend')
var keypather = require('keypather')()
var mongoose = require('mongoose')

var AppCodeVersionSchema = require('models/mongo/schemas/app-code-version')
var BaseSchema = require('models/mongo/schemas/base')
var logger = require('middlewares/logger')(__filename)
var validators = require('models/mongo/schemas/schema-validators').commonValidators

var ObjectId = mongoose.Schema.ObjectId
var Schema = mongoose.Schema
var log = logger.log

/** @alias module:models/version */
var ContextVersionSchema = module.exports = new Schema({
  /** type: object */
  createdBy: {
    type: {
      github: {
        type: Number
      //        validate: validators.number({ model: 'ContextVersion', literal: 'Github Owner' })
      }
    },
    required: 'ContextVersions require an created by'
  },
  /** type: object */
  owner: {
    required: 'ContextVersions require an Owner',
    type: {
      github: {
        type: Number
      }
    },
    username: String, // dynamic field for filling in
    gravatar: String
  },
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'ContextVersion', literal: 'Created'})
  },
  /** Dock box this context lives on
    * @type string */
  dockerHost: {
    type: String,
    validate: validators.dockerHost({model: 'ContextVersion'})
  },
  dockRemoved: {
    type: Boolean,
    default: false
  },
  /** container which built this context
    * @type string */
  // FIXME: lets get rid of cv.containerId soon
  // (now mirrors build._id and build.dockerContainerName)
  // currently required for buildLogs on frontend (change to build.dockerContainerName)
  containerId: {
    type: String,
    validate: validators.dockerId({model: 'Container'})
  },
  /** type: ObjectId */
  context: {
    type: ObjectId,
    index: true,
    required: 'ContextVersions require a Context',
    validate: validators.objectId({model: 'ContextVersion', literal: 'Context'})
  },
  // config version
  infraCodeVersion: {
    type: ObjectId,
    ref: 'InfraCodeVersion',
    // required: 'Context Versions requires an Infrastructure Code Version',
    validate: validators.objectId({model: 'ContextVersion', literal: 'InfraCodeVersion'}),
    index: true
  },
  appCodeVersions: {
    type: [AppCodeVersionSchema]
  },
  /**
   * @type {Boolean}
   * builds that are advanced have manually edited dockerfiles,
   * basic builds are builds created by the wizard
   * */
  advanced: {
    type: Boolean,
    index: true,
    default: false
  },
  /** type: object */
  build: {
    // image builder's container name is set to be cv.build._id
    _id: {
      type: ObjectId,
      default: function () { return new mongoose.Types.ObjectId() },
      index: true
    },
    hash: {
      type: String
    },
    network: {
      hostIp: {
        type: String
      }
    },
    message: {
      type: String,
      validate: validators.description({model: 'ContextVersion', literal: 'Message'})
    },
    triggeredBy: {
      type: {
        github: { // this is owner.
          type: Number
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
        },
        // this is a dynamically-populated field that should not be saved to the db.
        githubUser: Schema.Types.Mixed
      }
    },
    triggeredAction: {
      manual: Boolean,
      rebuild: Boolean,
      appCodeVersion: {
        repo: {
          type: String,
          validate: validators.githubOwnerAndRepo({
            model: 'ContextVersion',
            literal: 'Triggered AppCodeVersion Repo'
          })
        },
        lowerRepo: {
          type: String,
          index: true,
          validate: validators.githubOwnerAndRepo({
            model: 'ContextVersion',
            literal: 'Triggered AppCodeVersion Repo'
          })
        },
        commit: {
          type: String,
          validate: validators.gitCommit({
            model: 'ContextVersion',
            literal: 'Triggered AppCodeVersion Commit'
          })
        },
        commitLog: [Schema.Types.Mixed]
      }
    },
    started: { // time build started
      type: Date,
      validate: validators.beforeNow({model: 'ContextVersion', literal: 'Build Started'})
    },
    containerStarted: { // time build container started
      type: Date,
      validate: validators.beforeNow({model: 'ContextVersion', literal: 'Build Container Started'})
    },
    completed: {
      type: Date
    },
    error: {
      type: {
        message: String,
        stack: String
      }
    },
    dockerImage: {
      type: String,
      validate: validators.stringLengthValidator({
        model: 'ContextVersion',
        literal: 'Build Docker Image'
      }, 200)
    },
    dockerTag: {
      type: String,
      validate: validators.description({model: 'Version', literal: 'Build Docker Tag'})
    },
    /* container id is set after the container is actually created
     * don't rely on it to always exist (it isn't guaranteed to exist
     * even when build.started does)
     */
    dockerContainer: {
      type: String,
      index: true
    },
    log: Schema.Types.Mixed,
    failed: Boolean
  }
})

ContextVersionSchema.pre('save', function (next) {
  var lowerRepo = keypather.get(this, 'build.triggeredBy.appCodeVersion.lowerRepo')
  if (!lowerRepo) {
    var repo = keypather.get(this, 'build.triggeredBy.appCodeVersion.repo')
    if (repo) {
      this.build.triggeredBy.appCodeVersion.lowerRepo = repo && repo.toLowerCase()
    }
  }
  next(null, this)
})

extend(ContextVersionSchema.methods, BaseSchema.methods)
extend(ContextVersionSchema.statics, BaseSchema.statics)

ContextVersionSchema.index({_id: 1, 'appCodeVersions.lowerRepo': 1}, {unique: true})
ContextVersionSchema.index({
  'appCodeVersions.lowerRepo': 1,
  'appCodeVersions.lowerBranch': 1,
  'appCodeVersions.commit': 1,
  'infraCodeVersion': 1
})
ContextVersionSchema.index({
  'appCodeVersions.lowerRepo': 1,
  'appCodeVersions.commit': 1,
  'appCodeVersions.lowerBranch': 1
})
ContextVersionSchema.index({ 'build.started': 1, 'infraCodeVersion': 1 })
ContextVersionSchema.index({
  'build.started': -1,
  'infraCodeVersion': 1,
  'appCodeVersions.lowerRepo': 1,
  'appCodeVersions.commit': 1
})
ContextVersionSchema.index({
  'build.completed': 1,
  'build.hash': 1,
  'build._id': 1,
  'build.started': 1
})
ContextVersionSchema.index({
  'build.completed': 1,
  'build.hash': 1,
  'build._id': 1,
  'build.started': -1
})
ContextVersionSchema.index({ 'owner.github': 1 })

ContextVersionSchema.set('toJSON', { virtuals: true })
// ContextVersionSchema.post('init', function (doc) {
//  console.log('*** VERSION ****  %s has been initialized from the db', doc)
// })
ContextVersionSchema.pre('validate', function (next) {
  // Do validation here
  var self = this.toJSON()
  if (self.build && self.build.message) {
    var triggeredAction = self.build.triggeredAction
    var isHookTriggered = !(triggeredAction.rebuild || triggeredAction.manual)
    if ((isHookTriggered && !self.build.triggeredAction.appCodeVersion.commit) ||
      (!isHookTriggered && !self.build.triggeredBy)) {
      return next(new Error('Context Versions must either be triggered by a commit ' +
        '(triggeredAction.appCodeVersion), or by a user (triggeredBy).'))
    }
  }
  next()
})

ContextVersionSchema.virtual('build.duration').get(function () {
  if (this.build.completed) {
    return this.build.completed - this.build.started
  }
})

ContextVersionSchema.virtual('build.dockerContainerName').get(function () {
  return this.build._id
})

function numberRequirement (key) { return key && key.github && typeof key.github === 'number' }
ContextVersionSchema.path('createdBy').validate(numberRequirement, 'Invalid CreatedBy')
// FIXME: Do this shit
// function numberRequirement(key) {
//  if (!build) {
//    return true
//  }
//  else {
//    keypather.get('build.')
//  }
// }
// ContextVersionSchema.path('build').validate(numberRequirement, 'Invalid Build Object')

ContextVersionSchema.post('validate', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'version validated not saved yet')
})
ContextVersionSchema.post('save', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'version saved')
})
ContextVersionSchema.post('remove', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'version removed')
})
