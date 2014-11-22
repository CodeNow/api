'use strict';
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var Runnable = require('models/apis/runnable');
var error = require('error');

function handleContainerDie (data) {
  if (!isIpValid(data)) {
    return error.log('invalid data', data);
  }
  var host = encodeHostFromIp(data.ip);
  var containerId = data.id;
  // 1. find instance by container id
  Instance.findByContainerId(containerId, function (err, instance) {
    if (err) {
      error.log(err);
      return;
    }
    // 2. find instance owner
    User.findByGithubId(instance.owner.github, function (err, user) {
      if (err) {
        error.log(err);
        return;
      }
      // 3. instantiate runnbale-client with instance-owner
      var runnable = new Runnable({}, user);
      // call instance.stop
      // runnable.stopInstance
      runnable.newInstace(instanceId).stop({force: true}, function (err, resp) {
        console.log('we just called stop instance method', err, resp);
      });
    });
  );
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

exports.handleDockerDown = function(){};
exports.handleDockerUp = function(){};
exports.handleContainerDie = handleContainerDie;