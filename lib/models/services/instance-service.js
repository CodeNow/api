/**
 * Instance service performs more complex actions related to the instances.
 * The service interacts not only with DB models but with other systems like
 * job queue.
 * @module lib/models/services/instance-service
 */

'use strict';

var assign = require('101/assign');
var put = require('101/put');
var async = require('async');
var Boom = require('dat-middleware').Boom;
var Docker = require('models/apis/docker');
var equalObjectIds = require('utils/equal-object-ids');
var error = require('error');
var Mavis = require('models/apis/mavis');
var map = require('object-loops/map');
var ContextVersion = require('models/mongo/context-version');
var Instance = require('models/mongo/instance');
var log = require('middlewares/logger')(__filename).log;
var rabbitMQ = require('models/rabbitmq');
var toJSON = require('utils/to-json.js');
var joi = require('utils/joi');

function InstanceService () {}

module.exports = InstanceService;

/**
 * Find all forked instances that has specific main repo and branch deployed and
 * create `delete-instance` job for each of the found instances.
 * @param instanceId - this instance is the original. Shouldn't be deleted
 * @param userId - user that should perform instance deletion action
 * @param repo - repo name used for the instances search
 * @param branch - branch name used for the instances search
 * @param cb - standard Node.js callback
 */
InstanceService.prototype.deleteForkedInstancesByRepoAndBranch =
  function (instanceId, userId, repo, branch, cb) {
    var logData = {
      tx: true,
      instanceId: instanceId,
      userId: userId,
      repo: repo,
      branch: branch
    };
    log.info(logData, 'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch');
    // do nothing if parameters are missing
    if (!instanceId || !userId || !repo || !branch) {
      log.warn(logData, 'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch quit');
      return cb();
    }
    Instance.findForkedInstances(repo, branch, function (err, instances) {
      if (err) {
        log.error(put({ err: err }, logData),
          'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch');
        return cb(err);
      }
      if (instances) {
        var instancesToDelete = instances.filter(function (inst) {
          return inst._id.toString() !== instanceId.toString();
        });
        instancesToDelete.forEach(function (inst) {
          rabbitMQ.deleteInstance({
            instanceId: inst._id,
            instanceName: inst.name,
            sessionUserId: userId
          });
        });
      }
      cb();
    });
  };

/**
 * create a user container for an instance
 * @param  {Object}   opts
 * @param  {ObjectId|String} opts.instanceId       id of instance to create container for
 * @param  {ObjectId|String} opts.contextVersionId id of contextVersion (image) to create container
 * @param  {String}   opts.ownerUsername    instance owner's username
 * @param  {Function} cb                    callback
 */
InstanceService.createContainer = function (opts, cb) {
  var logData = {
    tx: true,
    opts: opts
  };
  log.info(logData, 'InstanceService.createContainer');
  async.waterfall([
    function validateOpts (cb) {
      joi.validateOrBoom(opts, joi.object({
        instanceId: joi.objectId().required(),
        contextVersionId: joi.objectId().required(),
        ownerUsername: joi.string().required(),
        sessionUserGithubId: joi.any().required()
      }).unknown().required(), cb);
    },
    InstanceService._findInstanceAndContextVersion,
    function (mongoData, cb) {
      var createOpts = assign(mongoData, opts);
      InstanceService._createDockerContainer(createOpts, cb);
    }
  ], cb);
};

/**
 * find one instance and one contextVersion by ids
 * @param  {Object}          opts
 * @param  {ObjectId|String} opts.instanceId instance id
 * @param  {ObjectId|String} opts.contextVersionId context version id
 * @param  {Function} cb     callback
 */
InstanceService._findInstanceAndContextVersion = function (opts, cb) {
  var logData = {
    tx: true,
    opts: opts
  };
  log.info(logData, 'InstanceService._findInstanceAndContextVersion');
  var instanceId = opts.instanceId;
  var contextVersionId = opts.contextVersionId;
  async.parallel({
    instance:
      Instance.findById.bind(Instance, instanceId),
    contextVersion:
      ContextVersion.findById.bind(ContextVersion, contextVersionId)
  }, function (err, data) {
    if (err) {
      log.error(put(logData, {err:err}), 'InstanceService._findInstanceAndContextVersion dbErr');
      return cb(err);
    }
    if (!data.instance) {
      err = Boom.notFound('Instance not found', opts);
    } else if (!data.contextVersion) {
      err = Boom.notFound('ContextVersion not found', opts);
    } else if (!equalObjectIds(data.instance.contextVersion._id, data.contextVersion._id)) {
      err = Boom.conflict('Instance\'s contextVersion has changed', opts);
    }
    log.trace(put(logData, { err:err }), 'InstanceService._findInstanceAndContextVersion final');
    cb(err, data);
  });
};

/**
 * create docker container for instance and cv
 * @param  {String}   ownerUsername instance owner username
 * @param  {Object}   opts     [description]
 * @param  {Object}   opts.instance instance which the container belongs
 * @param  {Object}   opts.contextVersion contextVersion's image
 * @param  {Object}   opts.ownerUsername instance owner's username
 * @param  {Object}   opts.sessionUserGithubId session user's github id
 * @param  {Function} cb            callback
 */
InstanceService._createDockerContainer = function (opts, cb) {
  var logData = {
    tx: true,
    ownerUsername: opts.ownerUsername,
    opts: map(opts, toJSON) // toJSON mongo docs before logging.
  };
  log.info(logData, 'InstanceService._createDockerContainer');
  var mavis = new Mavis();
  var instance = opts.instance;
  var contextVersion = opts.contextVersion;
  async.waterfall([
    findDockerHost,
    createDockerContainer
  ], finalCallback);
  function findDockerHost (cb) {
    log.info(logData, 'InstanceService._createDockerContainer findDockerHost');
    mavis.findDockForContainer(contextVersion, cb);
  }
  function createDockerContainer (dockerHost, cb) {
    log.info(put(logData, { dockerHost: dockerHost }),
      'InstanceService._createDockerContainer createDockerContainer');
    var docker = new Docker(dockerHost);
    docker.createUserContainer(opts, cb);
  }
  function finalCallback (err, container) {
    if (err) {
      log.error(put(logData, { err: err }),
        'InstanceService._createDockerContainer finalCallback error');
    } else {
      log.trace(logData, 'InstanceService._createDockerContainer finalCallback success');
    }
    if (error.is4XX(err)) {
      // 4XX errors indicate there is a input or state problem that cannot be resolved.
      // (Retries cannot fix 4XX errors, so we must mark the db as errored)
      // TODO(tj): handle image 404 w/ pull image worker
      log.error(put(logData, { err: err }), 'InstanceService._createDockerContainer 4XX error');
      return instance.modifyContainerCreateErr(contextVersion._id, err, function (err2) {
        // if db write is successful, callback 4XX error
        // if db write was unsuccessful (err2), then callback err2 (500 error)
        cb(err2 || err);
      });
    }
    cb(err, container);
  }
};


/**
 * Modifies instance container weave/network IP. Invalidates charon cache
 * @param instance - instance that should be updates
 * @param containerId - docker container id
 * @param containerIp - docker container weave IP
 * @param cb - standard Node.js callback
 */
InstanceService.prototype.modifyContainerIp = function (instance, containerId, containerIp, cb) {
  var logData = {
    tx: true,
    instanceId: instance._id,
    containerId: containerId,
    containerIp: containerIp
  };
  log.info(logData, 'InstanceService.prototype.modifyContainerIp');
  // Any time we receive new weave ip address
  // DNS entries for this container have been invalidated on the charon cache.
  instance.invalidateContainerDNS();

  var query = {
    _id: instance._id,
    'container.dockerContainer': containerId
  };
  var $set = {
    'network.hostIp': containerIp
  };
  Instance.findOneAndUpdate(query, { $set: $set }, function (err, instance) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'InstanceService.prototype.modifyContainerIp err');
      return cb(err);
    }
    if (!instance) { // changed or deleted
      log.error(logData,
        'InstanceService.prototype.modifyContainerIp error instance not found');
      return cb(Boom.conflict('Container IP was not updated, instance\'s container has changed'));
    }
    log.trace(logData, 'InstanceSchema.methods.modifyContainerInspect success');
    cb(null, instance);
  });
};
