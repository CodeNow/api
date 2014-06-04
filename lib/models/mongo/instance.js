'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var async = require('async');
var find = require('101/find');
var exists = require('101/exists');
var pluck = require('101/pluck');
var extend = require('lodash').extend;

var debug = require('debug')('runnableApi:instance:model');
var mongoose = require('mongoose');
var configs = require('configs');
var BaseSchema = require('models/mongo/base');
var Docklet = require('models/apis/docklet');
var Docker = require('models/apis/docker');
var Version = require('models/mongo/version');
var Boom = require('dat-middleware').Boom;
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/** @alias module:models/project */
var InstanceSchema = new Schema({
  // FIXME: do names really have to be unique?
  /** Name must be unique
   *  @type string */
  name: {
    type: String,
    index: { unique: true }
  },
  /** Defaults to false (private)
   *  @type string */
  'public': {
    type: Boolean,
    'default': false
  },
  /** @type ObjectId */
  owner: {
    type: ObjectId,
    index: true
  },
  /** @type ObjectId */
  createdBy: {
    type: ObjectId,
    index: true
  },
  /** Project of which this is a running instance of
   *  @type ObjectId */
  project: {
    type: ObjectId,
    index: true
  },
  /** Project-environment of which this is a running instance of
   *  @type ObjectId */
  environment: {
    type: ObjectId,
    index: true
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  /** Containers that are running for this instance
   *  @property {array} contexts[]
   *  @property {ObjectId} contexts[].container Id of the container running
   *  @property {ObjectId} contexts[].context Id of the context from which the container was built
   *  @property {ObjectId} contexts[].version Id of the context-version that was build */
  containers: [{
    name: { type: String }, // should be inherited from context
    context: { type: ObjectId },
    version: { type: ObjectId },
    /**
     * Docker host ip
     * @type {String}
     */
    dockerHost: {
      type: String
    },
    /**
     * Docker container Id
     * @type {String}
     */
    dockerContainer: { type: String },
    /** @type date */
    created: {
      type: Date,
      'default': Date.now,
      index: true
    },
    /**
     * Docker container ports - follows docker's schema
     * @type {Mixed}
     */
    ports: {
      type: Schema.Types.Mixed
    }
    /** FIXME: are we going to need ports anymore, or can we use real DNS?
     * port Port that the container is running on
     * @type {Object}
     */
    // servicesToken: { type: String },
    // webToken: { type: String },
    // ports: [{
    //   port: { type: Number },
    // }],
    // userDir: {
    //   type: String,
    //   'default': '$HOME'
    // }
  }],
  outputViews: {
    type: [{
      // FIXME: expand these as needed!
      name: String,
      type: String
    }],
    'default': []
  },
  /** Tags for the Project
   *  @type {ObjectId} */
  channels: {
    type:[{
      type: ObjectId,
      ref: 'Channels'
    }],
    'default': []
  },
  /** @type number */
  views: {
    type: Number,
    'default': 0,
    index: true
  },
  /** @type number */
  votes: {
    type: Number,
    'default': 0,
    index: true
  }
});

extend(InstanceSchema.methods, BaseSchema.methods);
extend(InstanceSchema.statics, BaseSchema.statics);


InstanceSchema.set('toJSON', { virtuals: true });

InstanceSchema.statics.createFromEnv = function (userId, project, environment, cb) {
  var docklet = new Docklet();
  var versionIds = environment.versions;
  if (!versionIds.length) {
    cb(Boom.badRequest('Environment does not have any contexts'));
  }
  else {
    async.waterfall([
      async.parallel.bind(async, {
        dockerHost: docklet.findDock.bind(docklet),
        versions: Version.findByIds.bind(Version, versionIds)
      }),
      createContainersForVersions
    ], function (err, containerInspects, dockerHost) {
      if (err) { return cb(err); }

      var contextIds = environment.contexts;
      var instance = new Instance();
      instance.set({
        createdBy: userId,
        project: project._id,
        owner: project.owner,
        environment: environment._id
      });
      containerInspects.forEach(function (inspect, i) {
        instance.containers.push({
          context   : contextIds[i],
          version   : versionIds[i],
          dockerHost: dockerHost,
          dockerContainer: inspect.id,
          ports     : inspect.NetworkSettings.Ports // FIXME: create hipache routes ...-port-80
        });
      });
      instance.save(cb);
    });
  }
};
function createContainersForVersions (results, cb) {
  var versions = results.versions;
  var docker = new Docker(results.dockerHost);

  docker.createContainersForVersions(versions, function (err, containerInspects) {
    cb(err, containerInspects, docker.host);
  });
}

/** Check to see if a project is public.
 *  @param {function} [cb] function (err, {@link module:models/instance Instance}) */
InstanceSchema.methods.isPublic = function (cb) {
  var err;
  if (!this.public) {
    err = Boom.forbidden('Instance is private');
  }
  cb(err, this);
};

var Instance = module.exports = mongoose.model('Instances', InstanceSchema);