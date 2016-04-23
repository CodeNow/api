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
var validators = require('models/mongo/schemas/schema-validators').commonValidators

var ObjectId = mongoose.Schema.ObjectId
var Schema = mongoose.Schema

/** @alias module:models/version */
var ContextVersionSchema = module.exports = new Schema({
  /** @type {String} keeps track of the state of this cv */
  state: {
    type: String
  },
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
  /** Previous dockerhost this context was built on
    * @type string */
  prevDockerHost: {
    type: String,
    validate: validators.dockerHost({model: 'ContextVersion'})
  },
  /**
   * This context version has been marked as unhealthy
   * @type Boolean
   */
  dockRemoved: {
    type: Boolean,
    default: false
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
  userContainerMemoryInBytes: Number, // Overridden user container memory
  buildDockerfilePath: String, // path to dockerfile in repo
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
      type: {
        hostIp: {
          type: String
        }
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
        branch: {
          type: String,
          validate: validators.stringLengthValidator({
            model: 'ContextVersion',
            literal: 'Triggered AppCodeVersion Branch'
          }, 200)
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
    /**
     * Docker container id for this contextVersion's build.  Can be a value copied over during a cv.dedupBuild
     */
    dockerContainer: {
      type: String,
      index: true,
      validate: validators.dockerId({model: 'Container'})
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

ContextVersionSchema.index({
  'build._id': 1,
  'status': 1
})

ContextVersionSchema.set('toJSON', { virtuals: true })

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

function numberRequirement (key) { return key && key.github && typeof key.github === 'number' }
ContextVersionSchema.path('createdBy').validate(numberRequirement, 'Invalid CreatedBy')
