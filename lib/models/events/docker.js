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
    return cb(Boom.badRequest('Invalid data: id is missing', { debug: data }));
  }
  if (!data.time) {
    return cb(Boom.badRequest('Invalid data: time is missing', { debug: data }));
  }
  if (!data.host) {
    return cb(Boom.badRequest('Invalid data: host is missing', { debug: data }));
  }
  var host = data.host;
  var flags = new Flags('container-die', containerId);
  flags.exists(function (err, reply) {
    if (err) { return cb(err); }
    // don't do anything
    if (reply && reply.toString() === '1') {
      // we skipped `die` event once. Now remove flag.
      flags.del(function (err) {
        if (err) { return cb(err); }
        return cb(Boom.conflict('Event is being handled by another subsystem', { debug: data }));
      });
    } else {
      // 1. find latest instance inspect
      // 2. update `Instance.container.inspect`
      Instance.findByContainerId(containerId, function (err, instance) {
        if (err) { return cb(err); }
        if (!instance) {
          error.log('Instance was not found', containerId);
          return cb(Boom.notFound('Instance was not found', { debug: data }));
        }
        instance.inspectAndUpdate(instance.container, host, cb);
      });
    }
  });
}

exports.handleContainerDie = handleContainerDie;