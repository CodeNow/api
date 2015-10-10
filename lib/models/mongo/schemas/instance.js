/**
 * @module lib/models/mongo/schemas/instance
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var extend = require('extend');
var mongoose = require('mongoose');

var BaseSchema = require('models/mongo/schemas/base');
var validators = require('models/mongo/schemas/schema-validators').commonValidators;
var logger = require('middlewares/logger')(__filename);

var ObjectId = mongoose.Schema.ObjectId;
var Schema = mongoose.Schema;
var log = logger.log;

/** @alias module:models/instance */
var InstanceSchema = module.exports = new Schema({
  shortHash: {
    type: String,
    index: {
      unique: true
    },
    required: 'Instances require a shortHash'
  },
  /** Name of this instance
   *  @type string */
  name: {
    type: String,
    required: 'Instances require a name',
    index: true,
    validate: validators.alphaNum({
      model: 'Instance',
      literal: 'Name'
    })
  },
  /** @type string */
  lowerName: {
    type: String,
    index: true,
    required: 'Instances require a lowerName',
    validate: validators.urlSafe({
      model: 'Instance',
      literal: 'Lower Name'
    })
  },
  /** Defaults to false (private)
   *  @type boolean */
  'public': {
    type: Boolean,
    'default': false
  },
  /** Defaults to false (not locked to commit and should follow the branch)
   *  @type boolean */
  locked: {
    type: Boolean,
    'default': false
  },
  /** @type Object */
  owner: {
    required: 'Instances require an Owner',
    type: {
      github: {
        type: Number,
        index: true
      // FIXME: nested validations dont work, validated on pre save
      // validate: validators.githubId({ model: 'Instance', literal: 'Github Owner' })
      },
      username: String, // dynamic field for filling in
      gravatar: String
    }
  },
  /** @type Object */
  createdBy: {
    required: 'Instances require an Created By',
    type: {
      github: {
        type: Number
      // FIXME: nested validations dont work, validated on pre save
      // validate: validators.githubId({ model: 'Instance', literal: 'Github CreatedBy' })
      },
      // fields used to pass things around back to the frontend
      username: String,
      gravatar: String
    }
  },
  /** Instance that this instance was forked from
   *  @type ObjectId */
  parent: {
    type: String,
    validate: validators.stringLengthValidator(
      {
        model: 'Instance',
        literal: 'Parent Instance Hash'
      }, process.env.HASHIDS_LENGTH)
  },

  /** build of which this is a running instance of
   *  @type ObjectId */
  build: {
    type: ObjectId,
    index: true,
    ref: 'Builds',
    required: 'Instances require an build',
    validate: validators.objectId({
      model: 'Instance',
      literal: 'Build'
    })
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({
      model: 'Instance',
      literal: 'Created'
    })
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
      /** Docker host where container is running
       *  @format: http://10.0.1.219:4242
       *  @type {String} */
      dockerHost: {
        type: String,
        validate: validators.dockerHost({
          model: 'Container'
        })
      },
      /** Docker container Id of running container
       *  @type {String} */
      dockerContainer: {
        type: String,
        index: true,
        validate: validators.dockerId({
          model: 'Container'
        })
      },
      // Number
      /** Docker container ports - follows docker's schema
       * NOTE: docker api v1.18 the value is defaulted to null
       *  @type {Mixed} */
      ports: {
        type: Schema.Types.Mixed
      },
      // Docker inspect dump for useful information
      inspect: {
        // .error indicates inspect failed
        type: Schema.Types.Mixed
      },
      // container create error - means instance.container has no dockerContainer
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
  /** previous successful built non-advanced context-version
      used for the rollback feature
   *  @type ObjectId */
  lastBuiltSimpleContextVersion: {
    id: {
      type: ObjectId,
      ref: 'ContextVersions',
      validate: validators.objectId({
        model: 'Instance',
        literal: 'ContextVersion'
      })
    },
    created: {
      type: Date
    }
  },
  dependencies: {
    type: Schema.Types.Mixed
  },
  masterPod: {
    type: Boolean,
    'default': false,
    index: true
  },
  hostname: String, // to fill in from graph
  // flag that indicates whether instance was created manually or autoforked
  autoForked: {
    type: Boolean,
    'default': false,
    index: true
  },
  /**
   * Value that defines if an instance is in isolation. If populated, it will
   * be an ObjectId of an Isolation model.
   * @type ObjectId
   */
  isolated: {
    type: ObjectId,
    index: true,
    validate: validators.objectId({
      model: 'Instance',
      literal: 'isolated'
    })
  },
  /**
   * Boolean indicating if the Instance is the "Isolation Group Master". This
   * means that this Instance was the one that was "put into isolation".
   * @type Boolean
   */
  isIsolationGroupMaster: Boolean
});

// Virtuals
// legacy schema support
InstanceSchema.virtual('containers')
  .get(function() {
    return this.container ? [this.container] : [];
  });
// legacy schema support
InstanceSchema.virtual('contextVersions')
  .get(function() {
    return this.contextVersion ? [this.contextVersion] : [];
  })
  .set(function(contextVersions) {
    this.contextVersion = contextVersions[0];
  });

InstanceSchema.path('name').set(function(val) {
  this.lowerName = val.toLowerCase();
  return val;
});


InstanceSchema.index({
  lowerName: 1,
  'owner.github': 1
}, {
  unique: true
});

InstanceSchema.index({
  masterPod: 1,
  'contextVersion.appCodeVersions.lowerRepo': 1
});
InstanceSchema.index({
  masterPod: 1,
  autoForked: 1,
  'contextVersion.appCodeVersions.lowerRepo': 1,
  'contextVersion.appCodeVersions.lowerBranch': 1
});

InstanceSchema.index({
  'inspect.NetworkSettings.IPAddress': 1,
  'container.dockerHost': 1,
  'owner.github': 1
});

InstanceSchema.index({
  masterPod: 1,
  'owner.github': 1
});
InstanceSchema.index({
  masterPod: 1,
  'owner.github': 1,
  'contextVersion.context': 1
});

// with Isolation, we have a set of default parameters we want to index
InstanceSchema.index({
  'owner.github': 1,
  isolated: 1,
  isIsolationGroupMaster: 1
});

extend(InstanceSchema.methods, BaseSchema.methods);
extend(InstanceSchema.statics, BaseSchema.statics);
// InstanceSchema.post('init', function (doc) {
//  console.log('*** INSTANCE ****  %s has been initialized from the db', doc);
// });
InstanceSchema.pre('validate', function(next) {
  // Do validation here
  next();
});
InstanceSchema.post('validate', function(doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'instance validated not saved');
});
InstanceSchema.post('save', function(doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'instance saved');
});
InstanceSchema.post('remove', function(doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'instance removed');
});

function numberRequirement(key) {
  return key && key.github && typeof key.github === 'number';
}
InstanceSchema.path('owner').validate(numberRequirement, 'Invalid Owner Id for Instance');

/* jshint maxcomplexity:20 */
InstanceSchema.pre('save', function(next) {
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
