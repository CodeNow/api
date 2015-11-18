/**
 * Pull an image for an instance in the worker. Should be robust (retriable on failure)
 * @module lib/workers/pull-instance-image
 */

var path = require('path')

require('loadenv')()
var Boom = require('dat-middleware').Boom
var error = require('error')
var put = require('101/put')
var logger = require('middlewares/logger')(__filename)
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var Mavis = require('models/apis/mavis')
var rabbitMQ = require('models/rabbitmq')
var toJSON = require('utils/to-json')
var toObjectId = require('utils/to-object-id')

// queue name matches filename
var queue = path.basename(__filename, '.js')
var log = logger.log

module.exports = pullInstanceImage

/**
 * worker task
 * @param  {Object } job worker job
 * @return {Promise} worker task promise
 */
function pullInstanceImage (job) {
  // shared data btw worker steps
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    instanceId: joi.objectIdString().required(),
    // build is the only reliable way to determine if instance has been "deployed"
    buildId: joi.objectIdString().required(),
    sessionUserGithubId: joi.string().required(),
    ownerUsername: joi.string().required()
  })
  return joi.validateOrBoomAsync(job, schema)
    .then(function findInstance (job) {
      log.info(logData, 'onInstanceImagePull.findInstance')
      return Instance.findOneAsync({
        _id: toObjectId(job.instanceId),
        build: toObjectId(job.buildId)
      }).then(function (instance) {
        if (!instance) {
          var err = Boom.notFound('instance not found (build has changed)')
          log.error(put(logData, { err: err }), 'onInstanceImagePull findOneAsync not found err')
          throw err
        }
        log.trace(logData,
          'onInstanceImagePull instance.findOneAsync instance found')
        return instance
      })
    })
    .then(function findDockerHost (instance) {
      log.info(logData, 'onInstanceImagePull.findDockerHost')
      var mavis = new Mavis()
      var cv = instance.contextVersion
      return Promise.props({
        instance: instance,
        dockerHost: mavis.findDockForContainerAsync(cv)
      })
    })
    .then(function modifyInstanceImagePull (data) {
      log.info(logData, 'onInstanceImagePull.modifyInstanceImagePull')
      var instance = data.instance
      var cv = instance.contextVersion
      var dockerTag = Docker.getDockerTag(cv)
      var instancePromise = instance.modifyImagePullAsync(cv._id, {
        dockerTag: dockerTag,
        dockerHost: data.dockerHost,
        sessionUser: {
          github: job.sessionUserGithubId
        },
        ownerUsername: job.ownerUsername
      }).then(function (instance) {
        if (!instance) {
          var err = Boom.notFound('instance not found (version has changed)')
          log.error(put(logData, { err: err }), 'onInstanceImagePull instance.modifyImagePullAsync not found err')
          throw err
        }
        log.trace(logData,
          'onInstanceImagePull instance.modifyImagePullAsync instance found')
        return instance
      })
      return Promise.props({
        instance: instancePromise,
        dockerHost: data.dockerHost,
        dockerTag: dockerTag
      })
    })
    .then(function pullImage (data) {
      log.info(logData, 'onInstanceImagePull.pullImage')
      var instance = data.instance
      var docker = new Docker(data.dockerHost)
      return docker.pullImageAsync(data.dockerTag)
        .then(function () {
          return data.instance // return instance
        })
        .catch(function (err) {
          log.error(
            put(logData, { err: err }), 'onInstanceImagePull pullImageAsync err')
          if (!Docker.isImageNotFoundForPullErr(err)) {
            throw err
          }
          // image not found in registry error
          // mark database and throw original error
          var cvId = instance.contextVersion._id
          return instance.modifyContainerCreateErrAsync(cvId, err)
            .then(function () {
              log.trace(logData,
                'onInstanceImagePull instance.modifyContainerCreateErrAsync success')
              // db write finished (ignore instance not found)
              // throw original error to prevent retries
              throw err
            })
        })
    })
    .then(function unsetImagePull (instance) {
      log.info(logData, 'onInstanceImagePull.unsetImagePull')
      return instance.modifyUnsetImagePullAsync(job.imagePullId)
        .then(function (instance) {
          if (!instance) {
            var err = Boom.notFound('instance with image pulling not found')
            log.error(
              put(logData, { err: err }),
              'onInstanceImagePull.unsetImagePull not found err')
            throw err
          }
          log.trace(
            put(logData, { err: err }),
            'onInstanceImagePull.unsetImagePull instance found')
          return instance
        })
    })
    .then(function createJob (instance) {
      log.info(
        put(logData, { instance: toJSON(instance) }),
        'onInstanceImagePull.createJob')
      rabbitMQ.createInstanceContainer({
        instanceId: instance._id.toString(),
        contextVersionId: instance.contextVersion._id.toString(),
        ownerUsername: job.ownerUsername,
        sessionUserGithubId: job.sessionUserGithubId
      })
    })
    .catch(errorHandler)
  /**
   * worker error handler determines if error is task fatal
   * or if the worker should be retried
   * @param  {Error} err error recieved from worker task
   * @return {[type]}     [description]
   */
  function errorHandler (err) {
    var _logData = put(logData, {
      err: err
    })
    log.error(_logData, 'pullInstanceImage errorHandler')
    if (error.is4XX(err)) {
      // end worker by throwing task fatal err
      throw new TaskFatalError(queue, err.message, {
        originalError: err
      })
    }
    // 50X error, retry
    throw err
  }
}
