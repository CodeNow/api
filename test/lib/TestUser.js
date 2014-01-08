var qs = require('querystring');
var _ = require('lodash');
var db = require('./db');
var httpMethods = require('methods');
var fstream = require('fstream');
var tar = require('tar');
var zlib = require('zlib');
var helpers = require('./helpers');
var async = require('./async');

var TestUser = module.exports = function (properties) {
  _.extend(this, properties);
};
/* TestUser.prototype[post, get, put, patch, delete, ...] */
httpMethods.forEach(function (method) {
  if (method === 'delete') {
    method = 'del';
  }
  TestUser.prototype[method] = function (path, token) {
    token = token || this.access_token;
    return helpers.request[method](path, token);
  };
  var bodyMethods = ['post', 'put', 'patch', 'del'];
  TestUser.prototype[method + 'Container'] = function (id, opts, callback) {
    if (!opts.qs && !opts.body) { // opts is body or querystring
      opts = ~bodyMethods.indexOf(method) ?
        { body: opts } :
        { qs: opts };
    }
    var path = '/users/me/runnables/' + id + (opts.qs ? '?' + qs.stringify(opts.qs) : '');
    var req = this[method](path);
    if (opts.body) {
      req.send(opts.body);
    }
    if (opts.expect) {
      req.expect(opts.expect);
    }
    req.end(function (err, res) {
      if (err) {
        console.log(method.toUpperCase() + ' ' + path);
        return callback(err);
      }
      callback(null, res.body);
    });
  };
});
// path args ... [query]
TestUser.prototype.specRequest = function () {
  if (typeof this.requestStr !== 'string') {
    throw new Error('spec request was not found');
  }
  var reqsplit = this.requestStr.split(' ');
  var method = reqsplit[0].toLowerCase();
  var path   = reqsplit[1];

  var args = Array.prototype.slice.call(arguments);
  var query;
  if (_.isObject(args[args.length - 1])) {
    query = args.pop();
  }
  var pathArgRegExp = /(\/):[^\/]*/;
  args.forEach(function (arg) {
    path = path.replace(pathArgRegExp, '$1'+arg);
  });
  if (pathArgRegExp.test(path)) {
    throw new Error('missing args for path');
  }
  var querystring = query ? '?'+qs.stringify(query) : '';
  if (typeof this[method] !== 'function') {
    console.error('"' +method+ '" is not an http method');
  }
  return this[method](path+querystring);
};
TestUser.prototype.register = function (auth) {
  return this.put('/users/me')
    .send(auth)
    .expect(200)
    .expectBody('_id');
};
TestUser.prototype.dbUpdate = function (updateSet, cb) {
  var self = this;
  var oid = require('mongodb').ObjectID;
  var userId = oid.createFromHexString(this._id);
  db.users.update({_id:userId}, updateSet, function (err, docsUpdated) {
    err = err || (docsUpdated === 0 && new Error('db update failed, user not found'));
    if (err) {
      return cb(err);
    }
    _.extend(self, updateSet);
    cb();
  });
};
TestUser.prototype.createImageFromFixture = function (name, callback) {
  if (this.permission_level < 5) {
    return callback(new Error('only admin users can create images from fixtures'));
  }
  var path = __dirname+"/fixtures/images/"+name;
  var compress = zlib.createGzip();
  var packer = tar.Pack();
  var reader = fstream.Reader({
    path: path,
    type: 'Directory',
    mode: '0755'
  });
  var request = this.post('/runnables/import')
    .set('content-type', 'application/x-gzip')
    .expect(201)
    .streamEnd(async.pick('body', callback));
  compress.pipe(request);
  packer.pipe(compress);
  reader.pipe(packer);
  reader.resume();
};
TestUser.prototype.createContainer = function (from, body, callback) {
  if (typeof body === 'function') {
    callback = body;
    body = null;
  }
  return this.post('/users/me/runnables?from=' + from)
    .send(body || {})
    .expect(201)
    .end(async.pick('body', callback));
};
TestUser.prototype.createContainerFromFixture = function (name, callback) {
  var self = this;
  this.createImageFromFixture(name, function (err, image) {
    if (err) {
      return callback(err);
    }
    self.createContainer(image._id, callback);
  });
};