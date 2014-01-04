require('console-trace')({always:true, right:true})
var _ = require('lodash');
var async = require('async');
var db = require('./lib/db');
var users = require('./lib/userFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var asyncExtend = helpers.asyncExtend;
var mongoose = require('mongoose');
var hb = require('./lib/fixtures/harbourmaster')
var dw = require('./lib/fixtures/dockworker')

describe('containers', function () {
  var image;

  before(function (done) {
    async.parallel([
      hb.start,
      dw.start
    ],
    function (err) {
      if (err) return done(err);
      helpers.createImageFromFixture('node.js', function (err, data) {
        if (err) return done(err);
        image = data;
        done();
      });
    });
  });
  after(function (done) {
    helpers.deleteImage(image._id, done);
  });

  describe('POST /users/me/runnables', function () {
    beforeEach(extendContext({
      hb   : hb.start,
      user : users.createAnonymous
    }));
    afterEach(async.series.bind(async, [
      db.dropCollection('users'),
      db.dropCollection('containers')
    ]));

    it ('should create a container', function (done) {
      var imageId = image._id
      this.user.specRequest({ from: imageId })
        .expect(201)
        .end(done)
    });
  });
});
