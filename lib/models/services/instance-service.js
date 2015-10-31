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
var ContextVersion = require('models/mongo/context-version');
var Instance = require('models/mongo/instance');

var log = require('middlewares/logger')(__filename).log;
var rabbitMQ = require('models/rabbitmq');
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
  async.waterfall([
    function validateOpts (cb) {
      joi.validateOrBoom(opts, {
        instanceId: joi.objectIdString().required(),
        contextVersionId: joi.objectIdString().required(),
        ownerUsername: joi.string().min(1).required()
      }, cb);
    },
    this._findInstanceAndContextVersion,
    this._createDockerContainer.bind(null, opts.ownerUsername),
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
  var instanceId = opts.instanceId;
  var contextVersionId = opts.contextVersionId;
  async.parallel({
    instance:
      Instance.findById.bind(Instance, instanceId),
    contextVersion:
      ContextVersion.findById.bind(ContextVersion, contextVersionId)
  }, function (err, data) {
    if (err) { return cb(err); }
    if (!data.instance) {
      err = Boom.notFound('Instance not found', opts);
    } else if (!data.contextVersion) {
      err = Boom.notFound('ContextVersion not found', opts);
    } else if (!equalObjectIds(data.instance.contextVersion._id, data.contextVersion._id)) {
      err = Boom.conflict('Instance\'s contextVersion has changed', opts);
    }
    cb(err, data);
  });
};

/**
 * create docker container for instance and cv
 * @param  {String}   ownerUsername instance owner username
 * @param  {Object}   mongoData     [description]
 * @param  {Object}   mongoData.instance instance which the container belongs
 * @param  {Object}   mongoData.contextVersion contextVersion's image
 * @param  {Function} cb            callback
 */
InstanceService._createDockerContainer = function (ownerUsername, mongoData, cb) {
  var mavis = new Mavis();
  var instance = mongoData.instance;
  var contextVersion = mongoData.contextVersion;
  async.waterfall([
    findDockerHost,
    createDockerContainer
  ], finalCallback);
  function findDockerHost (cb) {
    mavis.findDockForContainer(contextVersion, cb);
  }
  function createDockerContainer (dockerHost, cb) {
    var docker = new Docker(dockerHost);
    // note: do not use any 101 util that clones mongoData, it will error
    var createOpts = assign({ ownerUsername: ownerUsername }, mongoData);
    docker.createUserContainer(createOpts, cb);
  }
  function finalCallback (err, container) {
    if (error.is4XX(err)) {
      // 4XX errors indicate there is a input or state problem that cannot be resolved.
      // (Retries cannot fix 4XX errors, so we must mark the db as errored)
      // TODO(tj): handle image 404 w/ pull image worker
      return instance.modifyContainerCreateErr(contextVersion._id, err, function (err2) {
        // if db write is successful, callback 4XX error
        // if db write was unsuccessful (err2), then callback err2 (500 error)
        cb(err2 || err);
      });
    }
    cb(err, container);
  }
};