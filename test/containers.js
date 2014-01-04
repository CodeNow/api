//require('console-trace')({always:true, right:true})
var _ = require('lodash');
var async = require('async');
var db = require('./lib/db');
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var asyncExtend = helpers.asyncExtend;
var mongoose = require('mongoose');
var hb = require('./lib/fixtures/harbourmaster')
var dw = require('./lib/fixtures/dockworker')

describe('containers', function () {
  var image;

  before(function (done) {
    images.createImageFromFixture('node.js', function (err, data) {
      if (err) return done(err);
      image = data;
      done();
    });
  });
  after(helpers.cleanup);

  describe('POST /users/me/runnables', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    afterEach(helpers.cleanupExcept('images'));

    it ('should create a container', function (done) {
      var imageId = image._id
      this.user.specRequest({ from: imageId })
        .expect(201)
        .end(done)
    });
  });
});
