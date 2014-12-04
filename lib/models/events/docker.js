'use strict';
var Instance = require('models/mongo/instance');
var Flags = require('models/redis/flags');
var error = require('error');
var noop = require('101/noop');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:events:docker');

/**
 * Handle container `die` event.
 * @param data is raw json object received from docker-listener.
 * `data` should always have `uuid`, `host`, `time`, `id`, `status`, `from` fields.
 */
function handleContainerDie (data, cb) {
  debug('handle container die');

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
  if (!data.host) {
    error.log('invalid data: host is missing', data);
    return cb(Boom.create(422, 'Invalid data: host is missing'));
  }
  var host = data.host;
  var flags = new Flags('container-die', containerId);
  flags.exists(function (err, reply) {
    if (err) {
      error.log('internal error: cannot get flag from redis', err);
      return cb(Boom.create(500, 'Internal error'));
    }
    // don't do anything. flag exists
    if (reply && reply.toString() === '1') {
      // we skipped `die` event once. Now remove flag.
      flags.del(function (err) {
        if (err) {
          error.log('internal error: cannot get flag from redis', err);
          return cb(Boom.create(500, 'Internal error'));
        }
        return cb(Boom.conflict('Skipped event because it is being handled in another subsystem'));
      });
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


// exports.handleDockerDaemonDown = handleDockerDaemonDown;
// exports.handleDockerDaemonUp = handleDockerDaemonUp;
exports.handleContainerDie = handleContainerDie;