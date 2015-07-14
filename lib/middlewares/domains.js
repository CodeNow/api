/**
 * @module lib/middlewares/domains
 */
'use strict';

var domain = require('domain');
var isObject = require('101/is-object');
var keypather = require('keypather')();
var uuid = require('uuid');

var error = require('error');

/**
 * Wrap request handlers w/ domains for error handling
 */
module.exports = function (req, res, next) {
  var d = domain.create();
  d.runnableData = getRunnableData(req);
  req.domain = d;
  d.add(req);
  d.add(res);
  d.on('error', function (err) {
    error.errorHandler(err, req, res, next);
  });
  d.run(next);
};

/**
 * Append user data to runnableData
 */
function getRunnableData (req) {
  var runnableData = keypather.get(process, 'domain.runnableData');
  if (!isObject(runnableData)) {
    runnableData = {
      tid: uuid.v4()
    };
  }
  runnableData.userGithubUsername = keypather.get(req, 'sessionUser.accounts.github.username');
  runnableData.userGithubId = keypather.get(req, 'sessionUser.accounts.github.id');
  runnableData.userGithubEmail = keypather.get(req, 'sessionUser.email');
  return runnableData;
}
