var _ = require('lodash');
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
require('./lib/fixtures/dockworker');
var implData = helpers.implData;
var createCount = require('callback-count');

var docker = require('./lib/fixtures/docker');
var docklet = require('./lib/fixtures/docklet');

describe('Implementations', function () {
  before(function (done) {
    var count = createCount(done);
    this.docklet = docklet.start(count.inc().next);
    this.docker  = docker.start(count.inc().next);
  });
  after(function (done) {
    var count = createCount(done);
    this.docklet.stop(count.inc().next);
    this.docker.stop(count.inc().next);
  });
  before(extendContext({
    image: images.createImageFromFixture.bind(images, 'node.js')
  }));
  afterEach(helpers.cleanupExcept('image'));
  after(helpers.cleanup);

  describe('POST /users/me/implementations', function () {
    beforeEach(extendContextSeries({
      publ: users.createPublisher,
      spec: ['publ.createSpecification'],
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']]
    }));
    it('should create an implementation', function (done) {
      var data = implData(this.spec, this.container._id);
      var expected = _.omit(_.clone(data), 'containerId');
      this.user.specRequest()
        .send(data)
        .expect(201)
        .expectBody(expected)
        .end(done);
    });
  });
  describe('GET /users/me/implementations', function () {
    beforeEach(extendContextSeries({
      publ: users.createPublisher,
      spec: ['publ.createSpecification'],
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']],
      impl: ['user.createImplementation', ['spec', 'container._id']]
    }));
    // TODO: this really should return an array....
    it('should get an implementation by "implements"', function (done) {
      this.user.specRequest({ 'implements': this.spec._id })
        .expect(200)
        .expectBody(this.impl)
        .end(done);
    });
    it('should list a users implementations (no query)', function (done) {
      this.user.specRequest()
        .expect(200)
        .expectArray(1)
        .end(done);
    });
  });
  describe('PUT /users/me/implementations/:implementationId', function () {
    beforeEach(extendContextSeries({
      publ: users.createPublisher,
      spec: ['publ.createSpecification'],
      spec2: ['publ.createSpecification'],
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']],
      container2: ['user.createContainer', ['image._id']],
      impl: ['user.createImplementation', ['spec', 'container._id']]
    }));
    var updateField = function (key, val, done) {
      var update = implData(this.spec, this.containerId);
      update[key] = val || 'new';
      this.user.specRequest(this.impl._id)
        .send(update)
        .expect(200)
        .expectBody(function (body) {
          body[key].should.eql(val);
        })
        .end(done);
    };
    it('should allow update requirements', function (done) {
      var reqs = [];
      this.spec.requirements.forEach(function (name) {
        reqs.push({
          name: name,
          value: 'newvalue'
        });
      });
      var update = implData(this.spec, this.containerId);
      update.requirements = reqs;
      this.user.specRequest(this.impl._id)
        .send(update)
        .expect(200)
        .expectBody(function (body) {
          reqs.forEach(function (req) {
            var bodyReq = _.findWhere(body.requirements, req);
            bodyReq.should.have.property('name', req.name);
            bodyReq.should.have.property('value', req.value);
          });
        })
        .end(done);
    });
    // it('should allow update containerId', function (done) {
    //   var key = 'containerId';
    //   var val = this.container2._id;
    //   var update = implData(this.spec, this.containerId);
    //   update[key] = val;
    //   this.user.specRequest(this.impl._id)
    //     .send(update)
    //     .expect(200)
    //     .expectBody(key, val)
    //     .end(done);
    // });
  });
});