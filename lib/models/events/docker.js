'use strict';
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var Runnable = require('models/apis/runnable');
var error = require('error');
var async = require('async');


// 1. api lock
// 2. owner lock
// 3. find state of container if running
// 4. if running - run cleanup and release lock
function handleContainerDie (data) {
  if (!isIpValid(data)) {
    return error.log('invalid data: ip', data);
  }
  var containerId = data.id;
  if (!containerId) {
    return error.log('invalid data: containerId', data);
  }
  // 1. find instance by container id
  // 2. find instance owner
  // 3. instantiate runnable-client with instance-owner
  // 4. call instance.stop
  Instance.findByContainerId(containerId, function (err, instance) {
    if (err) {
      error.log(err);
      return;
    }
    applyInstanceAction('stop', instance);
  });
}

function handleDockerDaemonCriticalStateChange(actionFn, data) {
  if (!isIpValid(data)) {
    return error.log('invalid data: ip', data);
  }
  Instance.findAllByDockerHost(data.ip, function (err, instances) {
    if (err) {
      error.log(err);
      return;
    }
    // TODO (anton) clarify. I'm not sure if we can do this step in parallel.
    // Will it break other pieces of infrastructure?
    var iterator = applyInstanceAction.bind(this, actionFn);
    async.eachSeries(instances, iterator, function (err) {
      if (err) {
        error.log(err);
        return;
      }
    });
  });
}

function handleDockerDaemonUp (data) {
  handleDockerDaemonCriticalStateChange('start', data);
}

function handleDockerDaemonDown (data) {
  handleDockerDaemonCriticalStateChange('stop', data);
}

function applyInstanceAction (actionFn, instance, callback) {
  // find instance owner
  User.findByGithubId(instance.owner.github, function (err, user) {
    if (err) {
      error.log(err);
      callback(err);
    }
    // instantiate runnable-client with instance-owner
    var runnable = new Runnable({}, user);
    // call instance.action
    runnable.newInstance(instance._id)[actionFn]({force: true}, function (err, resp) {
      if (err) {
        error.log(err);
        callback(err);
      }
      console.log('we just called ' + actionFn + ' instance method', err, resp);
      callback(null);
    });
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