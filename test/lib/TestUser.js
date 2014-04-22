var qs = require('querystring');
var p = require('path');
var _ = require('lodash');
var helpers = require('./helpers');
var async = require('./async');
var bodyMethods = ['post', 'put', 'patch', 'del'];

var TestUser = module.exports = function (properties) {
  _.extend(this, properties);
};
['get', 'post', 'put', 'patch', 'delete'] // http methods we actually use
  .forEach(function (method) {
    if (method === 'delete') {
      method = 'del';
    }
    /* TestUser.prototype[post, get, put, patch, delete, ...] */
    TestUser.prototype[method] = function (path, token, opts, callback) {
      if (typeof token === 'object') {
        // (path, opts, callback)
        callback = opts;
        opts = token;
        token = null;
      } else if (typeof token === 'function') {
        // (path, callback)
        callback = token;
        token = null;
      }
      if (typeof opts === 'function') {
        callback = opts;
        opts = {};
      }
      opts = opts || {};
      if (!_.isEmpty(opts) && !opts.qs && !opts.body) { // opts is body or querystring
        opts = ~bodyMethods.indexOf(method) ?
          { body: opts } :
          { qs: opts };
      }
      token = token || this.access_token;
      path = path + (opts.qs ? '?' + qs.stringify(opts.qs) : '');
      var req = helpers.request[method](path, token);
      if (!_.isEmpty(opts.body)) {
        req.send(opts.body);
      }
      if (opts.expect) {
        req.expect(opts.expect);
      }
      if (!callback) {
        return req;
      } else {
        req.end(callback);
      }
    };
    /* TestUser.prototype[postUser, getUser, putUser, patchUser, deleteUser, ...] */
    /* TestUser.prototype[postContainer, getContainer, putContainer, patchContainer, deleteContainer, ...] */
    /* TestUser.prototype[postSpecification, getSpecification, putSpecification, patchSpecification, deleteSpecification, ...] */
    /* TestUser.prototype[postImplementation, getImplementation, putImplementation, patchImplementation, deleteImplementation, ...] */
    /* TestUser.prototype[postImage, getImage, putImage, patchImage, deleteImage, ...] */
    var modelUrlMap = {
      User          : '/users',
      Container     : '/users/me/runnables',
      Specification : '/specifications',
      Implementation: '/users/me/implementations',
      Image         : '/runnables'
    };
    var modelMethod = function (baseUrl) {
      return function (id, opts, callback) {
        if (typeof id === 'object') {
          callback = opts;
          opts = id;
          id = '';
        }
        if (typeof opts === 'function') {
          callback = opts;
          opts = {};
        }
        var path = p.join('/', baseUrl, id);
        if (!callback) {
          return this[method](path, opts);
        }
        else {
          this[method](path, opts, async.pick('body', callback));
        }
      };
    };
    Object.keys(modelUrlMap).forEach(function (modelName) {
      var baseUrl = modelUrlMap[modelName];
      TestUser.prototype[method + modelName] = modelMethod(baseUrl);
      if (method === 'get') {
        TestUser.prototype[method + modelName + 's'] = TestUser.prototype[method + modelName];
      }
    });
  });
// path args ... [query] [callback]
TestUser.prototype.specRequest = function () {
  if (typeof this.requestStr !== 'string') {
    throw new Error('spec request was not found');
  }
  var reqsplit = this.requestStr.split(' ');
  var method = reqsplit[0].toLowerCase();
  var path   = reqsplit[1];

  var args = Array.prototype.slice.call(arguments);
  args.forEach(function (i) { // filter out undef/null
    if (i === null || i === undefined) {
      var err = new Error('specRequest: invoked with undefined args [ '+ args +' ]');
      console.error(err.message);
      throw err;
    }
  });
  var query, callback;
  if (typeof args[args.length - 1] === 'function') {
    callback = args.pop();
  }
  if (_.isObject(args[args.length - 1])) {
    query = args.pop();
  }
  // replace url params
  var pathArgRegExp = /(\/):[^\/]*/;
  args.forEach(function (arg) {
    path = path.replace(pathArgRegExp, '$1'+arg);
  });
  if (pathArgRegExp.test(path)) {
    throw new Error('specRequest: missing args');
  }
  // make sure describe has an http method
  if (typeof this[method] !== 'function') {
    console.error('specRequest: check your describes, "' +method+ '" is not an http method');
  }
  var opts = _.isEmpty(query) ? {} : { qs:query };
  return this[method](path, opts, callback);
};

// TestUser Requests
require('./extendTestUser')(TestUser);
