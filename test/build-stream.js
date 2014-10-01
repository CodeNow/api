var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var createCount = require('callback-count');
var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

var ctx = {};

describe('Build Stream - /projects/:id/environments/:id/builds/:id/build', function() {
  ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('POST', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.contextVersion = contextVersion;
        ctx.context = context;
        ctx.build = build;
        ctx.user = user;
        done(err);
      });
    });

    it('should get full logs from build stream', function (done) {
      require('./fixtures/mocks/docker/container-id-attach.js')();
      ctx.build.build(ctx.buildId, {message: 'hello!'}, function (err, body, code) {
        if (err) {
          return done(err);
        }
        var id = body.contextVersions[0];

        expect(code).to.equal(201);
        expect(body).to.be.ok;

        require('./fixtures/mocks/docker/container-id-attach.js')();

        var client = new primusClient( 'http://localhost:' + process.env.PORT);
        // start build stream
        client.write({
          id: 1,
          event: 'build-stream',
          data: {
            id: id,
            streamId: id,
            substreamId: id
          }
        });


        client.on('data', function(msg) {
          if (msg.error) {
            done(new Error(JSON.stringify(msg)));
          }
          if(msg.event === 'BUILD_STREAM_ENDED' &&
            msg.data.id === body.contextVersions[0]) {
            client.end();
            Lab.expect(msg.data.log).to.equal(
              'Successfully built d776bdb409ab783cea9b986170a2a496684c9a99a6f9c048080d32980521e743');
            done();
          }
        });
      });
    });

    it('should get logs from build stream', function (done) {
      require('./fixtures/mocks/docker/container-id-attach.js')();
      ctx.build.build(ctx.buildId, {message: 'hello!'}, function (err, body, code) {
        if (err) {
          return done(err);
        }

        expect(code).to.equal(201);
        expect(body).to.be.ok;

        require('./fixtures/mocks/docker/container-id-attach.js')();

        var client = new primusClient( 'http://localhost:' + process.env.PORT);
        // start build stream
        var id = body.contextVersions[0];
        client.write({
          id: 1,
          event: 'build-stream',
          data: {
            id: id,
            streamId: id,
            substreamId: id
          }
        });
        var log = '';
        // create substream for build logs
        var buildStream = client.substream(body.contextVersions[0]);
        buildStream.on('data', function(data) {
          log += data.toString();
        });

        client.on('data', function(msg) {
          if (msg.error) {
            done(new Error(JSON.stringify(msg)));
          }
          if(msg.event === 'BUILD_STREAM_ENDED' &&
            msg.data.id === body.contextVersions[0]) {
            client.end();
            Lab.expect(log).to.equal(
              'Successfully built d776bdb409ab783cea9b986170a2a496684c9a99a6f9c048080d32980521e743');
            done();
          }
        });
      });
    });

    it('should error if build does not exist', function (done) {
      require('./fixtures/mocks/docker/container-id-attach.js')();

      var client = new primusClient( 'http://localhost:' + process.env.PORT);
      // start build stream
      client.write({
        id: 1,
        event: 'build-stream',
        data: {
          id: 'fakeVersion',
          streamId: 'fakeVersion',
          substreamId: 'fakeVersion'
        }
      });

      client.on('data', function(msg) {
        if (msg.error) {
          client.end();
          Lab.expect(msg.error).to.contain('could not find build in database');
          done();
        }
      });
    });

    it('100 people should get the same logs', {timeout: 10000}, function (done) {
      var people = 100;
      require('./fixtures/mocks/docker/container-id-attach.js')();
      ctx.build.build(ctx.buildId, {message: 'lots of people!'}, function (err, body, code) {
        if (err) {
          return done(err);
        }
        var id = body.contextVersions[0];

        expect(code).to.equal(201);
        expect(body).to.be.ok;
        var count = createCount(people, done);

        function checkData(client) {
          return function (msg) {
            if (msg.error) {
              done(new Error(JSON.stringify(msg)));
            }
            if(msg.event === 'BUILD_STREAM_ENDED' &&
              msg.data.id === body.contextVersions[0]) {
              client.end();
              Lab.expect(msg.data.log).to.equal(
                'Successfully built d776bdb409ab783cea9b986170a2a496684c9a99a6f9c048080d32980521e743');
              count.next();
            }
          };
        }

        for(var i = 0; i < people; i++) {
          require('./fixtures/mocks/docker/container-id-attach.js')();

          var client = new primusClient( 'http://localhost:' + process.env.PORT);
          // start build stream
          client.write({
            id: 1,
            event: 'build-stream',
            data: {
              id: id,
              streamId: id,
              substreamId: id
            }
          });

          client.on('data', checkData(client));
        }

      });
    });

  });
});


