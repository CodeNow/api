/**
 * Load workers and subscribe to jobs
 * @module workers/index
 */
'use strict';

var keypath = require('keypather')();

var subscribeJobs = process.env.SUBSCRIBE_JOBS.split(',');

var workers = {
  'container-create': require('./container-create')
};

subscribeJobs.forEach(function (job) {
  keypath.get(workers, job+'()');
});
