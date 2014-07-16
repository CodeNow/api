'use strict';

var util = require('util');
var GithubApi = require('github');
var defaults = require('defaults');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:github:model');

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

Github.prototype.getAuthorizedUser = function (cb) {
  if (!this.token) {
    return cb(Boom.badImplementation('checkOrgMembership should only be called with a user token'));
  }
  var self = this;
  debug('getting user self');
  var userKey = 'github-' + (this.token ? this.token : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':get:self');
  self._runQueryAgainstCache({
    query: this.user.get,
    stringKey: usernameKey
  }, cb);
};

Github.prototype.getUserByUsername = function (username, cb) {
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  var self = this;
  debug('getting username ' + username);
  var userKey = 'github-' + (this.token ? this.token : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':getByUsername:' + username);
  self._runQueryAgainstCache({
    query: this.user.getFrom,
    opts: { user: username },
    stringKey: usernameKey
  }, cb);
};

Github.prototype.getUserAuthorizedOrgs = function (sessionUserGithubId, cb) {
  var self = this;
  debug('getting user orgs');
  var userKey = 'github-' + (this.token ? this.token : 'runnable');
  var userOrgsKey = new redisTypes.String(userKey + ':user:' + sessionUserGithubId + ':orgs');
  self._runQueryAgainstCache({
    query: this.user.getOrgs,
    stringKey: userOrgsKey
  }, cb);
};

Github.prototype.checkOrgMembership = function (orgname, cb) {
  if (!this.token) {
    return cb(Boom.badImplementation('checkOrgMembership should only be called with a user token'));
  }
  var self = this;

  this.getAuthorizedUser(function (err, userData) {
    if (err) { cb(err); }
    else {
      debug('checking org membership for user');
      var username = userData.login;
      var userKey = 'github-' + (self.token ? self.token : 'runnable');
      var userOrgsKey = new redisTypes.String(userKey + ':org:' + orgname + ':member:' + username);
      var opts = {
        org: orgname,
        user: username
      };
      self._runQueryAgainstCache({
        query: self.orgs.getMember,
        opts: opts,
        stringKey: userOrgsKey
      }, function (err, data, meta) {
        if (err && err.output.statusCode === 404) { 
          cb(Boom.forbidden('user ' + username + ' is not a member of ' + orgname));
        } else if (err) {
          cb(err);
        } else if (meta.statusCode === 302) {
          cb(Boom.forbidden('could not verify membership for ' + username + ' in ' + orgname));
        } else {
          cb(err, data);
        }
      });
    }
  });

};

// I assume one would only ever not pass `opts`.
Github.prototype._runQueryAgainstCache = function (options, cb) {
  debug('_runQueryAgainstCache');
  var query = options.query;
  var stringKey = options.stringKey || undefined;
  var opts = options.opts || undefined;
  // var cache404 = options.cache404 || false;

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
      // if we still have a different error, pass it along
      if (err) {
        err = (err.code === 404) ?
          Boom.notFound('github query failed to find the resource', { err: err }) :
          Boom.create(502, 'failed to get the resource via query', { err: err });
        cb(err);
      } else {
        // making statusCode a little easier to check
        var hasDocMetaStatus = docs && docs.meta && docs.meta.status && true;
        if (hasDocMetaStatus) {
          // get the first 3 digits and make them a number on the meta
          docs.meta.statusCode = 1 * /^\d{3}/.exec(docs.meta.status)[0];
        }
        // if it was a 304, our cache is good, it's a hit
        if (haveCachedEtag && hasDocMetaStatus && docs.meta.statusCode === 304) {
          debug('got a 304 - not changed');
          cb(null, cachedData, true);
        }
        // else, we got a response, and our cache is out of date
        else {
          debug('got a full response. need to update cache');
          cb(null, docs, false);
        }
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
        cb(err, saveData.data, saveData.meta);
      });
    }
  }
};
