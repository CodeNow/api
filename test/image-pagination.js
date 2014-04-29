var utils = require('middleware/utils');
var _ = require('lodash');
var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var containers = require('./lib/containerFactory');
var channels = require('./lib/channelsFactory');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
var uuid = require('node-uuid');
var configs = require('configs');
var createCount = require('callback-count');
var docker = require('./lib/fixtures/docker');
var docklet = require('./lib/fixtures/docklet');

describe('Image Pagination', function () {
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
  after(helpers.cleanup);

  describe('GET /runnables', function () {
    describe('all', function () {
      beforeEach(extendContextSeries({
        admin: users.createAdmin,
        channels: channels.createChannels('one', 'two'),
        image:    ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image2:   ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image3:   ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]],
        image4:   ['admin.createTaggedImage', ['node.js', 'channels[1]']],
        image5:   ['admin.createTaggedImage', ['node.js', 'channels[1]']],
        image6: images.createImageFromFixture.bind(images, 'node.js', 'name4'),
        user: users.createAnonymous
      }));
      afterEach(helpers.cleanup);
      it('should list only tagged runnables (no query)', function (done) {
        this.user.specRequest()
          .expect(200)
          .expectBody(function (body) {
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(5);
          })
          .end(done);
      });
      it('should list all runnables (all query)', function (done) {
        this.user.specRequest({ all:true })
          .expect(200)
          .expectBody(function (body) {
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(6);
          })
          .end(done);
      });
      it('should list all (tagged) runnables for site map (map query)', function (done) {
        this.user.specRequest({ map: true })
          .expect(200)
          .expectArray(5)
          .end(done);
      });
      it('should list all (tagged) runnables by owner', function (done) {
        this.user.specRequest({ owner: this.admin._id })
          .expect(200)
          .expectBody(function (body) {
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(5);
          })
          .end(done);
      });
      it('should list all (tagged) runnables by ownerUsername', function (done) {
        this.user.specRequest({ ownerUsername: this.admin.username })
          .expect(200)
          .expectBody(function (body) {
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(5);
          })
          .end(done);
      });
    });


    describe('channel runnables', function () {
      before(extendContextSeries({
        admin: users.createAdmin,
        channels: channels.createChannels('one', 'two', 'three'),
        image:  ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image2: ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image3: ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]],
        image4: ['admin.createTaggedImage', ['node.js', 'channels[1]']],
        image5: ['admin.createTaggedImage', ['node.js', ['channels[1]', 'channels[2]']]],
        image6: ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]]
      }));
      it('should list runnable by channel', function (done) {
        this.user.specRequest({
            channel: this.channels[0].name,
            page: 1,
            limit: 2
          })
          .expect(200)
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(1);
            body.channels.should.have.a.lengthOf(2);
            body.data.should.have.a.lengthOf(2);
            body.data[0].tags.should.be.an.instanceOf(Array);
            body.data[0].tags[0].should.have.property('name');
            // not sorted any specific way
          })
          .end(done);
      });
      it('should list runnables and sort -created', function (done) {
        var images = [this.image5];
        this.user.specRequest({
            channel: this.channels[1].name,
            sort:'-created',
            page: 1,
            limit: 1
          })
          .expect(200)
          .expectBody(function (body) {
            body.channels.should.have.a.lengthOf(3);
            body.paging.lastPage.should.equal(3);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      it('should list runnables and sort (+)created', function (done) {
        var images = [this.image3, this.image6];
        this.user.specRequest({
            channel: this.channels[0].name,
            sort:'created',
            page: 1,
            limit: 2
          })
          .expect(200)
          .expectBody(function (body) {
            body.channels.should.have.a.lengthOf(2);
            body.paging.lastPage.should.equal(1);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      describe('filtering multiple channels', function () {
        it('should list runnables and be sorted', function (done) {
          var images = [this.image6, this.image3];
          this.user.specRequest({
              channel: [this.channels[0].name, this.channels[1].name],
              sort:'-created',
              page: 0,
              limit: 2
            })
            .expect(200)
            .expectBody(function (body) {
              body.channels.should.have.a.lengthOf(2);
              body.paging.lastPage.should.equal(0);
              body.data.should.have.a.lengthOf(images.length);
              _.each(images, bodyImageDataCheck, body);
            })
            .end(done);
        });
      });
    });
  });
});

function bodyImageDataCheck(image, index, images) {
  this.data[index]._id.should.equal(image._id);
}
