'use strict';
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var Runnable = require('models/apis/runnable');

function handleContainerDie(data) {
  if (!isIpValid(data)) {
    return error.log('invalid data', data);
  }
  var host = encodeHostFromIp(data.ip);
  var containerId = data.id;
  // 1. find instance by container id
  Instance.findByContainerId(containerId, function (err, container) {
    if (err) {
      // TODO (anton) handle error
      return;
    }
    // 2. find instance owner
    User.findByGithubId(container.owner.github, function (err, user) {
      if (err) {
        // TODO (anton) handle error
        return;
      }
      var runnable = new Runnable({}, user);
    });
  );

  // instantiate runnbale-client with instance-owner
  // call instance.stop

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
exports.handleContainerDie = function () {};