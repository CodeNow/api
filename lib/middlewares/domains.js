/**
 * @module lib/middlewares/domains
 */
'use strict';

var domain = require('domain');
var isObject = require('101/is-object');
var keypather = require('keypather')();
var shimmer = require('shimmer');
var uuid = require('uuid');

var error = require('error');
var log = require('middlewares/logger')(__filename).log;

/**
 * Wrap request handlers w/ domains for error handling
 */
module.exports = function (req, res, next) {
  var d = domain.create();
  req.domain = d;
  d.runnableData = getRunnableData(req);
  d.add(req);
  d.add(res);
  d.on('error', function (err) {
    error.errorHandler(err, req, res, next);
  });
  if (!res._headers[process.env.TID_RESPONSE_HEADER_KEY]) {
    res.set(process.env.TID_RESPONSE_HEADER_KEY, keypather.get(req.domain, 'runnableData.tid'));
  }
  /**
   * monkey-patch send w/ logging
   */
  shimmer.wrap(res, 'send', function (original) {
    return function () {
      log.info({
        tx: true
      }, 'res.send');
      original.apply(original, arguments);
    };
  });
  d.run(next);
};

/**
 * Set domain properties after session initialized
 */
module.exports.updateDomain = function (req, res, next) {
  var runnableData = getRunnableData(req);
  if (req.domain) {
    req.domain.runnableData = runnableData;
  }
  next();
};

/**
 * Append user data to runnableData
 */
function getRunnableData (req) {
  var runnableData = keypather.get(process, 'domain.runnableData');
  if (!isObject(runnableData)) {
    runnableData = {
      tid: uuid.v4(),
      url: req.method.toUpperCase() + ' ' + req.url
    };
  }
  runnableData.userGithubUsername = keypather.get(req, 'sessionUser.accounts.github.username');
  runnableData.userGithubId = keypather.get(req, 'sessionUser.accounts.github.id');
  runnableData.userGithubEmail = keypather.get(req, 'sessionUser.email');
  return runnableData;
}
