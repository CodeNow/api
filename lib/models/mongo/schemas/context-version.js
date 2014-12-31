'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var extend = require('extend');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var AppCodeVersionSchema = require('models/mongo/schemas/app-code-version');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:context-version:model');
var keypather = require('keypather')();

/** @alias module:models/version */
var ContextVersionSchema = module.exports = new Schema({
  /** type: ObjectId */
  createdBy: {
    type: {
      github: {
        type: Number
//        validate: validators.number({ model: 'ContextVersion', literal: 'Github Owner' })
      }
    },
    required: 'ContextVersions require an created by'
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
  /** container which built this context
    * @type string */
  containerId: {
    type: String,
    validate: validators.dockerId({model: 'Container'})
  },
  /** type: ObjectId */
  context: {
    type: ObjectId,
    index: true,
    required: 'ContextVersions require a Context',
    validate: validators.objectId({model:'ContextVersion', literal: 'Context'})
  },
  // config version
  infraCodeVersion: {
    type: ObjectId,
    ref: 'InfraCodeVersion',
    // required: 'Context Versions requires an Infrastructure Code Version',
    validate: validators.objectId({model:'ContextVersion', literal: 'InfraCodeVersion'}),
    index: true
  },
  appCodeVersions: {
    type: [AppCodeVersionSchema]
  },
  /** type: object */
  build: {
    hash: {
      type: String,
    },
    message: {
      type: String,
      validate: validators.description({model:'ContextVersion', literal: 'Message'})
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
      validate: validators.beforeNow({model: 'ContextVersion', literal: 'Build Created'})
    },
    completed: {
      type: Date
    },
    /** type: number */
    duration: {
      type: Number,
      index: true,
      validate: validators.beforeNow({model: 'Builds', literal: 'Created'})
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
      validate: validators.description({model:'Version', literal: 'Build Docker Tag'})
    },
    log: {
      type: String
    }
  }
});

ContextVersionSchema.pre('save', function (next) {
  var lowerRepo = keypather.get(this, 'build.triggeredBy.appCodeVersion.lowerRepo');
  if (!lowerRepo) {
    var repo = keypather.get(this, 'build.triggeredBy.appCodeVersion.repo');
    if (repo) {
      this.build.triggeredBy.appCodeVersion.lowerRepo = repo && repo.toLowerCase();
    }
  }
  next(null, this);
});

extend(ContextVersionSchema.methods, BaseSchema.methods);
extend(ContextVersionSchema.statics, BaseSchema.statics);

ContextVersionSchema.index({_id: 1, 'appCodeVersions.lowerRepo': 1}, {unique: true});
ContextVersionSchema.index({
  'appCodeVersions.lowerRepo': 1,
  'appCodeVersions.lowerBranch': 1,
  'appCodeVersions.commit': 1,
  'infraCodeVersion': 1
});
ContextVersionSchema.index({
  'appCodeVersions.lowerRepo': 1,
  'appCodeVersions.commit': 1,
  'appCodeVersions.lowerBranch': 1
});
ContextVersionSchema.index({ 'build.started': 1, 'infraCodeVersion': 1 });
ContextVersionSchema.index({
  'build.started': -1,
  'infraCodeVersion': 1,
  'appCodeVersions.lowerRepo':1,
  'appCodeVersions.commit':1
});

ContextVersionSchema.set('toJSON', { virtuals: true });
// ContextVersionSchema.post('init', function (doc) {
//  console.log('*** VERSION ****  %s has been initialized from the db', doc);
// });
ContextVersionSchema.pre('validate', function (next) {
  // Do validation here
  var self = this.toJSON();
  if (self.build && self.build.message) {
    var triggeredAction = self.build.triggeredAction;
    var isHookTriggered = !(triggeredAction.rebuild || triggeredAction.manual);
    if ((isHookTriggered && !self.build.triggeredAction.appCodeVersion.commit) ||
      (!isHookTriggered && !self.build.triggeredBy)) {
      return next(new Error('Context Versions must either be triggered by a commit ' +
        '(triggeredAction.appCodeVersion), or by a user (triggeredBy).'));
    }
  }
  next();
});

function numberRequirement(key) { return key && key.github && typeof key.github === 'number'; }
ContextVersionSchema.path('createdBy').validate(numberRequirement, 'Invalid CreatedBy');
//FIXME: Do this shit
//function numberRequirement(key) {
//  if (!build) {
//    return true;
//  }
//  else {
//    keypather.get('build.')
//  }
//}
//ContextVersionSchema.path('build').validate(numberRequirement, 'Invalid Build Object');

ContextVersionSchema.post('validate', function (doc) {
  debug('*** VERSION ****  %s has been validated (but not saved yet)', doc);
});
ContextVersionSchema.post('save', function (doc) {
  debug('*** VERSION ****  %s has been saved', doc);
});
ContextVersionSchema.post('remove', function (doc) {
  debug('*** VERSION ****  %s has been removed', doc);
});
