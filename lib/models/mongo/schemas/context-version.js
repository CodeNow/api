'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var extend = require('extend');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:context-version:model');
var keypather = require('keypather')();

var AppCodeVersionSchema = new Schema({
  // owner/repo
  repo: {
    type: String,
    validate: validators.githubOwnerAndRepo({
      model: 'ContextVersion',
      literal: 'AppCodeVersion Repo'
    }),
    required: 'Version AppCodes require a Repo name'
  },
  lowerRepo: {
    type: String,
    index: true,
    validate: validators.githubOwnerAndRepo({
      model: 'ContextVersion',
      literal: 'AppCodeVersion lowerRepo'
    }),
    required: 'Version AppCodes require a Lower Repo name'
  },
  branch: {
    type: String,
    validate: validators.stringLengthValidator({
      model: 'ContextVersion',
      literal: 'AppCodeVersion Branch'
    }, 200)
  },
  lowerBranch: {
    type: String,
    validate: validators.stringLengthValidator({
      model: 'ContextVersion',
      literal: 'AppCodeVersion Branch'
    }, 200),
    index: true,
  },
  commit: {
    type: String,
    validate: validators.gitCommit({
      model: 'ContextVersion',
      literal: 'AppCodeVersion Commit'
    })
  },
  updated: Boolean, // flag if version is new
  lockCommit: {
    type: Boolean,
    default: false,
    required: 'Version AppCodes require a Lock Commit flag'
  },
  publicKey: String,
  privateKey: String
});

AppCodeVersionSchema.path('repo').set(function (repo) {
  this.lowerRepo = repo && repo.toLowerCase();
  return repo;
});
AppCodeVersionSchema.path('branch').set(function (branch) {
  this.lowerBranch = branch && branch.toLowerCase();
  return branch;
});

/** @alias module:models/version */
var ContextVersionSchema = module.exports = new Schema({
  /** type: ObjectId */
  createdBy: {
    type: {
      github: {
        type: Number,
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
  /** type: ObjectId */
  project: {
    type: ObjectId,
    required: 'ContextVersion require an Project',
    validate: validators.objectId({model: 'ContextVersion', literal: 'Project'})
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
    validate: validators.objectId({model:'ContextVersion', literal: 'InfraCodeVersion'})
  },
  appCodeVersions: {
    type: [AppCodeVersionSchema]
  },
  /** type: object */
  build: {
    message: {
      type: String,
      validate: validators.description({model:'ContextVersion', literal: 'Message'})
    },
    triggeredBy: {
      type: {
        github: { // this is owner.
          type: Number,
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

ContextVersionSchema.index({_id: 1, 'appCodeVersions.repo': 1}, {unique: true});

ContextVersionSchema.set('toJSON', { virtuals: true });
// ContextVersionSchema.post('init', function (doc) {
//  console.log('*** VERSION ****  %s has been initialized from the db', doc);
// });
ContextVersionSchema.pre('validate', function (next) {
  // Do validation here
  debug('*** CONTEXT VERION PREVALIDATION');
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
