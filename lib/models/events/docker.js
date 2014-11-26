'use strict';
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var Runnable = require('models/apis/runnable');
var error = require('error');
var async = require('async');
var noop = require('101/noop');
var Boom = require('dat-middleware').Boom;



// 1. api lock
// 2. owner lock
// 3. find state of container if running
// 4. if running - run cleanup and release lock
function handleContainerDie (data, cb) {
  cb = cb || noop;
  if (!isIpValid(data)) {
    error.log('invalid data: ip is missing', data);
    return cb(Boom.create(422, 'Invalid data: ip is missing'));
  }
  var containerId = data.id;
  if (!containerId) {
    error.log('invalid data: id is missing', data);
    return cb(Boom.create(422, 'Invalid data: id is missing'));
  }
  // 1. find instance by container id
  // 2. find instance owner
  // 3. instantiate runnable-client with instance-owner
  // 4. call instance.stop
  Instance.findByContainerId(containerId, function (err, instance) {
    if (err) {
      error.log(err);
      return cb(err);
    }
    if (!instance) {
      error.log('invalid data: container with provided id doesnot exist', data);
      return cb(Boom.notFound('Invalid data: container with provided id doesnot exist'));
    }
    var finishedAt = new Date(data.time).toISOString();
    instance.setContainerFinishedState(finishedAt, cb);
  });
}

function handleDockerDaemonCriticalStateChange(actionFn, data, cb) {
  cb = cb || noop;
  if (!isIpValid(data)) {
    error.log('invalid data: ip is missing', data);
    return cb(Boom.create(422, 'Invalid data: ip is missing'));
  }
  Instance.findAllByDockerHost(data.ip, function (err, instances) {
    if (err) {
      error.log(err);
      return cb(err);
    }
    var iterator = applyInstanceAction.bind(this, actionFn);
    async.each(instances, iterator, cb);
  });
}

function handleDockerDaemonUp (data, cb) {
  handleDockerDaemonCriticalStateChange('start', data, cb);
}

function handleDockerDaemonDown (data, cb) {
  handleDockerDaemonCriticalStateChange('stop', data, cb);
}

function applyInstanceAction (actionFn, instance, cb) {
  // find instance owner
  User.findByGithubId(instance.owner.github, function (err, user) {
    if (err) {
      error.log(err);
      return cb(err);
    }
    // instantiate runnable-client with instance-owner
    var runnable = new Runnable({}, user);
    // call instance.action
    runnable.newInstance(instance.shortHash)[actionFn]({force: true}, cb);
  });
}




/**
 * ensures data has ip address
 * @param  {[type]}  data [description]
 * @return {Boolean}      [description]
 */
function isIpValid (data) {
  if (!data ||
    !data.ip ||
    typeof data.ip !== 'string') {
      return false;
  }

  return true;
}

exports.handleDockerDaemonDown = handleDockerDaemonDown;
exports.handleDockerDaemonUp = handleDockerDaemonUp;
exports.handleContainerDie = handleContainerDie;