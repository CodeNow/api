var qs = require('querystring');
var _ = require('lodash');
var db = require('./db')
var httpMethods = require('methods');
var fstream = require('fstream');
var tar = require('tar');
var zlib = require('zlib');

var TestUser = module.exports = function (properties) {
  _.extend(this, properties);
};
/* TestUser.prototype[post, get, put, patch, delete, ...] */
httpMethods.forEach(function (method) {
  TestUser.prototype[method] = function (path, token) {
    token = token || this.access_token;
    return helpers.request[method](path, token)
  };
});
TestUser.prototype.specRequest = function (query) {
  var titlesplit = this.specTitle.split(' ')
  var method = titlesplit[0].toLowerCase();
  var path   = titlesplit[1];
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
    err = err || (docsUpdated === 0 && new Error('db update failed, user not found'))
    if (err) return cb(err);
    _.extend(self, updateSet);
    cb()
  });
};
TestUser.prototype.createImageFromFixture = function (name, callback) {
  if (this.permission_level < 5) throw new Error('only admin users can create images from fixtures');
  var path = __dirname+"/fixtures/images/"+name;
  var compress = zlib.createGzip()
  var packer = tar.Pack()
  var reader = fstream.Reader({
    path: path,
    type: 'Directory',
    mode: '0755'
  });
  var request = this.post('/runnables/import')
    .set('content-type', 'application/x-gzip')
    .expect(201)
  compress.pipe(request)
  packer.pipe(compress)
  reader.pipe(packer)
  reader.resume()
  return request;
};
TestUser.prototype.createContainer = function (from) {
  return this.post('/users/me/runnables?from'+from)
    .send(body)
    .expect(201)
};