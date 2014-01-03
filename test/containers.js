//require('console-trace')({always:true, right:true})
var _ = require('lodash');
var async = require('async');
var db = require('./lib/db');
var users = require('./lib/userFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var asyncExtend = helpers.asyncExtend;
var mongoose = require('mongoose');
var hb = require('./lib/fixtures/harbourmaster')

describe('POST /users/me/runnables', function () {
  beforeEach(extendContext({
    hb   : hb.start,
    user : users.createAnonymous,
    image: helpers.createImageFromFixture.bind(helpers, 'node.js')
  }));
  afterEach(async.series.bind(async, [
    db.dropCollections,
  ]));

  it ('should create a container', function (done) {
    var imageId = this.image._id;
    this.user.specRequest({from:imageId})
      .expect(201)
      .end(done)
  });
});