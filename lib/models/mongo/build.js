'use strict'

const Boom = require('dat-middleware').Boom
const isString = require('101/is-string')
const isFunction = require('101/is-function')
const mongoose = require('mongoose')
const omit = require('101/omit')
const Promise = require('bluebird')

const BuildCounter = require('models/mongo/build-counter')
const BuildSchema = require('models/mongo/schemas/build')
const logger = require('middlewares/logger')(__filename)

const log = logger.log

/**
 * create a shallow copy of a build - keeps same infra and appCode
 * @param  {Object}   props props to set on the build
 * @param  {Function} cb    callback(err, newBuild)
 */
var fieldsToOmit = [
  '_id',
  'created',
  'createdBy'
]
BuildSchema.methods.shallowCopy = function (props, cb) {
  var build = this
  var buildData
  // ugly-ish, but needed for omit to work correctly
  try {
    buildData = build.toJSON()
  } catch (e) {
    return cb(e)
  }
  var newBuild = new Build(omit(buildData, fieldsToOmit))
  newBuild.set(props)
  newBuild.save(cb)
}

BuildSchema.methods.setInProgress = function (user, cb) {
  var build = this
  if (build.started) {
    cb(Boom.conflict('Build is already in progress'))
  } else if (build.completed) {
    cb(Boom.conflict('Build has already completed'))
  }
  BuildCounter.next(build.environment, function (err, buildNumber) {
    if (err) {
      cb(err)
    } else {
      Build.findOneAndUpdate({
        _id: build._id,
        started: { $exists: false }
      }, {
        $set: {
          buildNumber: buildNumber,
          started: Date.now()
        }
      }, function (err, build) {
        if (err) {
          cb(err)
        } else if (!build) {
          cb(Boom.conflict('Build is already in progress'))
        } else {
          cb(null, build)
        }
      })
    }
  })
}

/**
 * mark all builds w/ context versions as completed
 * @param  {Array}    versionIds    context version ids
 * @param  {Boolean}  [failed] if build failed (due to error or exit code), default: false
 * @param  {Function} cb       callback
 */
BuildSchema.statics.updateCompletedByContextVersionIds = function (versionIds, failed, cb) {
  log.trace({
    versionIds: versionIds,
    failed: failed
  }, 'BuildSchema.statics.updateCompletedByContextVersionIds')
  if (isFunction(failed)) {
    cb = failed
    failed = null
  }
  failed = failed || false
  var update = {
    $set: {
      completed: Date.now(),
      failed: failed
    }
  }
  var opts = {
    multi: true
  }
  Build.updateBy('contextVersions', { $in: versionIds }, update, opts, cb)
}

/**
 * mark all builds w/ context versions as completed and failed
 * - failed is true for builds w/ cv's that errored
 * - failed is true for builds w/ image-builders that exited w/ a non-zero code
 * @param  {Array}    versionIds context version ids
 * @param  {Function} cb    callback
 */
BuildSchema.statics.updateFailedByContextVersionIds = function (versionIds, cb) {
  log.trace({
    versionIds: versionIds
  }, 'BuildSchema.statics.updateFailedByContextVersionIds')
  this.updateCompletedByContextVersionIds(versionIds, true, cb)
}

/**
 * find builds by contextVersionIds
 * @param  {Array}    versionIds context version ids
 * @param  {Function} cb    callback
 */
BuildSchema.statics.findByContextVersionIds = function (versionIds, cb) {
  Build.findBy('contextVersions', { $in: versionIds }, cb)
}

BuildSchema.methods.modifyErrored = function (contextVersionId, cb) {
  var now = Date.now()
  Build.findByIdAndUpdate(this._id, {
    $set: {
      failed: true,
      completed: now,
      duration: now - this.started
    }
  }, cb)
}

/**
 * @param {Boolean} cvBuildObject - build object from a cv model
 * @param cb callback
 */
BuildSchema.methods.modifyCompletedIfFinished = function (cvBuildObject, cb) {
  if (cvBuildObject.completed) {
    this.modifyCompleted(cvBuildObject.failed, cb)
  } else {
    cb()
  }
}

/**
 * @param {Boolean} failed - build failed due to user error
 */
BuildSchema.methods.modifyCompleted = function (failed, cb) {
  if (isString(failed)) {
    // for old context versions that
    // do not have failed property.
    // Can be removed after 10/1/2015
    failed = false
  }
  var now = Date.now()
  Build.findByIdAndUpdate(this._id, {
    $set: {
      completed: now,
      failed: failed
    }
  }, cb)
}

/**
 * updateContextVersions with the ones provided if they don't match
 * @param {ContextVersionModel} cV contextVersion model to be replace
 * @param {ContextVersionModel} cV2 contextVersion model to replace cV with
 * @param {callback} cb  cb(err, build)
 */
BuildSchema.methods.replaceContextVersion = function (cV, cV2, cb) {
  if (cV._id.toString() === cV2._id.toString()) {
    return cb(null, this)
  }
  var query = {
    _id: this._id,
    contextVersions: cV._id.toString()
  }
  var update = {
    $set: {
      'contextVersions.$': cV2._id.toString()
    }
  }
  var self = this
  Build.update(query, update, function (err) {
    if (err) { return cb(err) }
    Build.findById(self._id, cb)
  })
}

var Build = module.exports = mongoose.model('Builds', BuildSchema)
Promise.promisifyAll(Build)
Promise.promisifyAll(Build.prototype)
