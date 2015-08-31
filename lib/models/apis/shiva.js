/**
 * used to send jobs to Shiva
 * @module lib/models/apis/shiva
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var error = require('error');
var put = require('101/put');
var rabbitMQ = require('models/rabbitmq');
var Github = require('models/apis/github');

var dogstatsd = require('models/datadog');
var log = require('middlewares/logger')(__filename).log;

module.exports = Shiva;

function Shiva () { }

/**
 * get orgId and publish job for shiva to create cluster
 * @param  {object}   req  express request object
 *                    req.name: org/user name which is white listed
 * @param  {object}   res  express response
 * @param  {Function} next express next
 */
Shiva.publishClusterProvisionMw = function (req, res, next) {
  dogstatsd.increment('api.cluster-provision', 1);
  var name = req.body.name;
  var logData = {
    tx: true,
    name: name
  };
  log.info(logData, 'Shiva.publishClusterProvision');
  var github = new Github({ token: process.env.HELLO_RUNNABLE_GITHUB_TOKEN });
  github.getUserByUsername(name, function (err, userData) {
    if (err || !userData) {
      err = err || Boom.badRequest('userData not found');
      error.log(err, req);
      log.error(put({
        err: err,
        userData: userData
      }, logData), 'Shiva.publishClusterProvision: getUserByUsername error');
      return next(err);
    }
    rabbitMQ.publishClusterProvision({
      githubId: userData.id,
    });
    next();
  });
};
