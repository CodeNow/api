'use strict';
var Instance = require('models/mongo/instance');
var Flags = require('models/redis/flags');
var error = require('error');
var noop = require('101/noop');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:events:docker');

function handleContainerDie (data, cb) {
  debug('handle container die');
  var flags = new Flags();
  cb = cb || noop;
  var containerId = data.id;
  if (!containerId) {
    error.log('invalid data: id is missing', data);
    return cb(Boom.create(422, 'Invalid data: id is missing'));
  }
  if (!data.time) {
    error.log('invalid data: time is missing', data);
    return cb(Boom.create(422, 'Invalid data: time is missing'));
  }
  if (!isIpValid(data)) {
    error.log('invalid data: ip is missing', data);
    return cb(Boom.create(422, 'Invalid data: ip is missing'));
  }
  var host = encodeHostFromIp(data.ip);
  flags.get(containerId, '-die-flag', function (err, reply) {
    if (err) {
      error.log('internal error: cannot get flag from redis', err);
      return cb(Boom.create(500, 'Internal error'));
    }
    // don't do anything
    if (reply && reply.toString() === 'ignore') {
      // we skipped `die` event once. Now remove flag.
      flags.del(containerId + '-die-flag', cb);
    } else {
      // 1. find latest instance inspect
      // 2. update `Instance.container.inspect`
      Instance.findByContainerId(containerId, function (err, instance) {
        if (err) {
          return cb(err);
        }
        if (!instance) {
          error.log('Instance was not found', containerId);
          return cb(Boom.create(404, 'Instance was not found'));
        }
        instance.inspectAndUpdate(instance.container, host, cb);
      });
    }
  });
}

// function handleDockerDaemonCriticalStateChange(actionFn, data, cb) {
//   cb = cb || noop;
//   if (!isIpValid(data)) {
//     error.log('invalid data: ip is missing', data);
//     return cb(Boom.create(422, 'Invalid data: ip is missing'));
//   }
//   Instance.findAllByDockerHost(data.ip, function (err, instances) {
//     if (err) {
//       error.log(err);
//       return cb(err);
//     }
//     var iterator = applyInstanceAction.bind(this, actionFn);
//     async.each(instances, iterator, cb);
//   });
// }

// function handleDockerDaemonUp (data, cb) {
//   debug('handle docker daemon up');
//   handleDockerDaemonCriticalStateChange('start', data, cb);
// }

// function handleDockerDaemonDown (data, cb) {
//   debug('handle docker daemon down');
//   handleDockerDaemonCriticalStateChange('stop', data, cb);
// }

// function applyInstanceAction (actionFn, instance, cb) {
//   // find instance owner
//   User.findByGithubId(instance.owner.github, function (err, user) {
//     if (err) {
//       error.log(err);
//       return cb(err);
//     }
//     // instantiate runnable-client with instance-owner
//     var runnable = new Runnable({}, user);
//     // call instance.action
//     runnable.newInstance(instance.shortHash)[actionFn]({force: true}, cb);
//   });
// }


/**
 * turns ip into properly formatted host
 * @param  'string' ip ip to convert
 * @return 'string'    converted string
 */
function encodeHostFromIp(ip) {
  return 'http://' + ip + ':4242';
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

// exports.handleDockerDaemonDown = handleDockerDaemonDown;
// exports.handleDockerDaemonUp = handleDockerDaemonUp;
exports.handleContainerDie = handleContainerDie;