'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var BaseSchema = require('models/mongo/schemas/base');
var extend = require('extend');
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:instance:model');
var Boom = require('dat-middleware').Boom;

/** @alias module:models/instance */
var InstanceSchema = module.exports = new Schema({
  shortHash: {
    type: String,
    index: { unique: true },
    required: 'Instances require a shortHash'
  },
  /** Name of this instance
   *  @type string */
  name: {
    type: String,
    required: 'Instances require a name',
    index: true,
    validate: validators.alphaNum({model:'Instance', literal: 'Name'})
  },
  /** @type string */
  lowerName: {
    type: String,
    required: 'Instances require a lowerName',
    validate: validators.urlSafe({model: 'Instance', literal: 'Lower Name'})
  },
  /** Defaults to false (private)
   *  @type string */
  'public': {
    type: Boolean,
    'default': false
  },
  /** @type ObjectId */
  owner: {
    required: 'Instances require an Owner',
    type: {
      github: {
        type: Number,
        // FIXME: nested validations dont work, validated on pre save
        // validate: validators.githubId({ model: 'Instance', literal: 'Github Owner' })
      },
      username: String // dynamic field for filling in
    }
  },
  /** @type ObjectId */
  createdBy: {
    required: 'Instances require an Created By',
    type: {
      github: {
        type: Number,
        // FIXME: nested validations dont work, validated on pre save
        // validate: validators.githubId({ model: 'Instance', literal: 'Github CreatedBy' })
      }
    }
  },
  /** Instance that this instance was forked from
   *  @type ObjectId */
  parent: {
    type: String,
    validate: validators.stringLengthValidator(
      {model:'Instance', literal: 'Parent Instance Hash'}, process.env.HASHIDS_LENGTH)
  },

  /** build of which this is a running instance of
   *  @type ObjectId */
  build: {
    type: ObjectId,
    index: true,
    ref: 'Builds',
    required: 'Instances require an build',
    validate: validators.objectId({model:'Instance', literal: 'Build'})
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'Instance', literal: 'Created'})
  },
  env: [{
    type: String,
    'default': []
  }],
  network: {
    networkIp: {
      type: String,
      required: 'Instances require a networkIp'
    },
    hostIp: {
      type: String,
      required: 'Instances require a hostIp'
    }
  },
  container: {
    type: {
      /** Docker host ip
       *  @type {String} */
      dockerHost: {
        type: String,
        validate: validators.dockerHost({model: 'Container'})
      },
      /** Docker container Id
       *  @type {String} */
      dockerContainer: {
        type: String,
        validate: validators.dockerId({model: 'Container'}),
      },
      // Number
      /** Docker container ports - follows docker's schema
       *  @type {Mixed} */
      ports: {
        type: Schema.Types.Mixed
      },
      // Docker inspect dump for useful information
      inspect: {
        type: Schema.Types.Mixed
      },
      error: {
        type: {
          message: String,
          stack: String,
          data: Schema.Types.Mixed
        }
      }
    }
  },
  contextVersion: { // always going to be just one
    type: require('models/mongo/context-version').schema.tree
  },
  dependencies: {
    type: Schema.Types.Mixed
  }
});

// Virtuals
// legacy schema support
InstanceSchema.virtual('containers')
  .get(function () {
    return this.container? [this.container] : [];
  });
// legacy schema support
InstanceSchema.virtual('contextVersions')
  .get(function () {
    return this.contextVersion? [this.contextVersion] : [];
  })
  .set(function (contextVersions) {
    this.contextVersion = contextVersions[0];
  });

InstanceSchema.path('name').set(function (val) {
  this.lowerName = val.toLowerCase();
  return val;
});


InstanceSchema.index({ lowerName: 1, 'owner.github': 1 }, { unique: true });

extend(InstanceSchema.methods, BaseSchema.methods);
extend(InstanceSchema.statics, BaseSchema.statics);
// InstanceSchema.post('init', function (doc) {
//  console.log('*** INSTANCE ****  %s has been initialized from the db', doc);
// });
InstanceSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
InstanceSchema.post('validate', function (doc) {
  debug('*** INSTANCE ****  %s has been validated (but not saved yet)', doc);
});
InstanceSchema.post('save', function (doc) {
  debug('*** INSTANCE ****  %s has been saved', doc);
});
InstanceSchema.post('remove', function (doc) {
  debug('*** INSTANCE ****  %s has been removed', doc);
});

function numberRequirement(key) { return key && key.github && typeof key.github === 'number'; }
InstanceSchema.path('owner').validate(numberRequirement, 'Invalid Owner Id for Instance');

/*jshint maxcomplexity:20*/
InstanceSchema.pre('save', function (next) {
  var err;
  if (!this.owner || (!this.owner.github)) {
    err = Boom.badRequest('Instance\'s owner githubId is required');
    err.name = 'ValidationError';
    next(err);
  } else if (!this.createdBy || (!this.createdBy.github)) {
    err = Boom.badRequest('Instance\'s createdBy githubId is required');
    err.name = 'ValidationError';
    next(err);
  } else if (isNaN(this.owner.github)) {
    err = Boom.badRequest('Instance\'s owner githubId must be a number');
    err.name = 'ValidationError';
    next(err);
  } else if (isNaN(this.createdBy.github)) {
    err = Boom.badRequest('Instance\'s createdBy githubId must be a number');
    err.name = 'ValidationError';
    next(err);
  } else {
    next();
  }
});