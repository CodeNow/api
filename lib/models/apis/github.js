'use strict';

var util = require('util');
var GithubApi = require('github');
var defaults = require('defaults');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:github:model');
var isFunction = require('101/is-function');

var async = require('async');
var redisTypes = require('redis-types');

module.exports = Github;

function Github (opts) {
  opts = defaults(opts, {
    // required
    version: '3.0.0',
    // optional
    debug: false, // envIs('development', 'test'),
    protocol: 'https',
    requestMedia: 'application/json'
  });
  GithubApi.call(this, opts);

  if (opts.token) {
    this.token = opts.token;
    this.authenticate({
      type: 'oauth',
      token: opts.token
    });
  }
  else {
    this.authenticate({
      type: 'oauth',
      key:  process.env.GIT_HUB_CLIENT_ID,
      secret: process.env.GIT_HUB_CLIENT_SECRET
    });
  }
}

util.inherits(Github, GithubApi);

Github.prototype.getUserByUsername = function (username, cb) {
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  var self = this;
  debug('getting username ' + username);
  var userKey = 'github-' + (this.token ? this.token : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':getByUsername:' + username);
  self._runQueryAgainstCache(this.user.getFrom, { user: username }, usernameKey, cb);
};

Github.prototype.getUserAuthorizedOrgs = function (sessionUserGithubId, cb) {
  var self = this;
  debug('getting user orgs');
  var userKey = 'github-' + (this.token ? this.token : 'runnable');
  var userOrgsKey = new redisTypes.String(userKey + ':user:' + sessionUserGithubId + ':orgs');
  self._runQueryAgainstCache(this.user.getOrgs, userOrgsKey, cb);
};

// I assume one would only ever not pass `opts`.
Github.prototype._runQueryAgainstCache = function (query, opts, stringKey, cb) {
  debug('_runQueryAgainstCache');
  if (isFunction(stringKey)) {
    cb = stringKey;
    stringKey = opts;
    opts = undefined;
  }

  async.waterfall([
    fetchCachedQueryData,
    checkIfResourceChanged,
    updateCachedQueryData
  ], cb);

  function fetchCachedQueryData (cb) {
    debug('fetchCachedQueryData');
    stringKey.get(function (err, cachedData) {
      if (err) { cb(err); }
      else { cb(null, JSON.parse(cachedData)); }
    });
  }

  function checkIfResourceChanged (cachedData, cb) {
    debug('checkIfResourceChanged');
    // get etag, if it exists
    // if no etag, get resource
    // if etag, *check* resource, if changed, download
    opts = opts || {};
    var haveCachedEtag = cachedData && cachedData.meta && cachedData.meta.etag ? true : false;
    if (haveCachedEtag) {
      // we have an old response, check the etag
      opts.headers = opts.headers || {};
      opts.headers['If-None-Match'] = cachedData.meta.etag;
    }

    query(opts, function (err, docs) {
      var hasDocMetaStatus = docs && docs.meta && docs.meta.status && true;
      // if we still have a different error, pass it along
      if (err) {
        err = (err.code === 404) ?
          Boom.notFound('github query failed to find the resource', { err: err }) :
          Boom.create(502, 'failed to get the resource via query', { err: err });
        cb(err);
      }
      // if it was a 304, our cache is good, it's a hit
      // this is a stupid check, but that's the only way to check for 304 in this module
      else if (haveCachedEtag && hasDocMetaStatus && docs.meta.status.indexOf('304') !== -1) {
        debug('got a 304 - not changed');
        cb(null, cachedData, true);
      }
      // else, we got a response, and our cache is out of date
      else {
        debug('got a full response. need to update cache');
        cb(null, docs, false);
      }
    });
  }

  function updateCachedQueryData (queryData, cacheIsValid, cb) {
    debug('updateCachedQueryData');
    if (cacheIsValid) {
      // pass along the data if the cache was valid
      cb(null, queryData.data);
    } else {
      // update the cache if it is invalid
      var saveData = {};
      if (queryData.meta) {
        saveData.meta = queryData.meta;
        delete queryData.meta;
      }
      saveData.data = queryData;
      stringKey.set(JSON.stringify(saveData), function (err) {
        cb(err, saveData.data);
      });
    }
  }
};
