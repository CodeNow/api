var p = require('path');
var _ = require('lodash');
var db = require('./db');
var fstream = require('fstream');
var tar = require('tar');
var zlib = require('zlib');
var helpers = require('./helpers');
var async = require('./async');
var uuid = require('node-uuid');

module.exports = function (TestUser) {
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
  TestUser.prototype.createImageFromFixture = function (name, imageName, callback) {
    if (typeof imageName === 'function') {
      callback = imageName;
      imageName = null;
    }
    imageName = imageName || name;
    if (this.permission_level < 3) {
      return callback(new Error('only publishers and admin users can create images from fixtures'));
    }
    var path = p.join(__dirname, '/fixtures/images/', name);
    fstream.Reader({
      path: path,
      type: 'Directory',
      mode: '0755'
    }).pipe(tar.Pack())
      .pipe(zlib.createGzip())
      .pipe(this.post('/runnables/import?name=' + imageName)
        .set('content-type', 'application/x-gzip')
        .expect(201)
        .streamEnd(async.pick('body', callback)));
  };
  TestUser.prototype.createContainer = function (from, body, callback) {
    if (typeof body === 'function') {
      callback = body;
      body = null;
    }
    if (typeof callback !== 'function') {
      console.log(arguments);
    }
    this.postContainer({ qs: { from: from } })
      .send(body || {})
      .expect(201)
      .end(async.pick('body', callback));
  };
  TestUser.prototype.createImage = function (from, callback) {
    this.postImage({ qs: { from: from } })
      .expect(201)
      .end(async.pick('body', callback));
  };
  TestUser.prototype.containerCreateFile = function (containerId, dirData, callback) {
    var url = p.join('/users/me/runnables/', containerId, '/files');
    this.post(url)
      .send(dirData)
      .expect(201)
      .end(async.pick('body', callback));
  };
  TestUser.prototype.createTaggedImage = function (fixtureName, channelNames, callback) {
    if (channelNames && !Array.isArray(channelNames)) {
      channelNames = [channelNames];
    }
    var self = this;
    var containerId;
    async.waterfall([
      this.createContainerFromFixture.bind(this, fixtureName, fixtureName+helpers.randomValue()),
      function (container, cb) {
        async.map(channelNames, function (channelName, cb) {
          self.tagContainerWithChannel(container, channelName, cb);
        },
        function (err) {
          cb(err, container);
        });
      },
      function (container, cb) { // rename container to prevent image name conflict
        self.patchContainer(container._id, { name: fixtureName+helpers.randomValue() }, cb);
      },
      function (container, cb) {
        self.createImage(container._id, cb); // TODO: change to publish back..
      }
    ], callback);
  };
  TestUser.prototype.createContainerFromFixture = function (name, imageName, callback) {
    var self = this;
    async.waterfall([
      function (cb) {
        self.createImageFromFixture(name, imageName, cb);
      },
      function (image, cb) {
        self.createContainer(image._id, cb);
      }
    ], callback);
  };
  TestUser.prototype.createSpecification = function (body, callback) {
    if (typeof body === 'function') {
      callback = body;
      body = null;
    }
    body = body || {};
    body = _.extend(helpers.specData(),  { name: 'name-'+uuid.v4() }, body);
    this.postSpecification({
      body: body,
      expect: 201
    }, callback);
  };
  TestUser.prototype.createImplementation = function (spec, containerId, callback) {
    var body = _.extend(helpers.implData(spec, containerId));
    this.postImplementation({
      body: body,
      expect: 201
    }, callback);
  };
  TestUser.prototype.createChannel = function (name, callback) {
    var url = p.join('/channels');
    this.post(url)
      .send({ name: name })
      .expect(201)
      .end(async.pick('body', callback));
  };
  TestUser.prototype.createChannel = function (name, callback) {
    var url = p.join('/channels');
    this.post(url)
      .send({ name: name })
      .expect(201)
      .end(async.pick('body', callback));
  };
  TestUser.prototype.createCategory = function (name, callback) {
    var url = p.join('/categories');
    this.post(url)
      .send({ name: name })
      .expect(201)
      .end(async.pick('body', callback));
  };
  TestUser.prototype.tagContainerWithChannel = function (containerId, channelName, callback) {
    containerId = containerId._id || containerId;
    channelName = channelName.name || channelName;
    var url = p.join('/users/me/runnables/', containerId, 'tags');
    this.post(url)
      .send({ name: channelName })
      .expect(201)
      .end(async.pick('body', callback));
  };
  TestUser.prototype.tagChannelWithCategory = function (channelId, categoryName, callback) {
    channelId = channelId._id || channelId;
    categoryName = categoryName.name || categoryName;
    var url = p.join('/channels/', channelId, 'tags');
    this.post(url)
      .send({ category: categoryName })
      .expect(201)
      .end(async.pick('body', callback));
  };
};