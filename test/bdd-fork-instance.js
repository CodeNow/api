var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var uuid = require('uuid');
var async = require('async');
var RedisList = require('redis-types').List;
var exists = require('101/exists');
var Build = require('models/mongo/build');
var extend = require('extend');
var noop = require('101/noop');

var createCount = require('callback-count');
var pick = require('101/pick');

describe('FORK INSTANCE BDD', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user, modelsArr) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      ctx.contextVersion = modelsArr[0];
      ctx.context = modelsArr[1];
      done();
    });
  });

  it('should fork an instance with new build', { timeout: 5000 }, function (done) {
    var count = createCount(2, function (err) {
      console.log('DONE!!!');
      console.log('DONE!!!');
      console.log('DONE!!!');
      console.log('DONE!!!', err);
      done(err);
    });
    async.waterfall([
      createVersion,
      createBuild,
      buildBuild,
      tailInstance
    ], count.next);
    function createVersion (cb) {
      var newVersion = ctx.context.createVersion({
        infraCodeVersion:
          ctx.contextVersion.attrs.infraCodeVersion,
        appCodeVersions:
          ctx.contextVersion.attrs.appCodeVersions.map(pick('repo', 'branch', 'commit'))
      }, function (err) {
        cb(err, newVersion);
      });
    }
    function createBuild (newVersion, cb) {
      var newBuild = ctx.user.createBuild({
        contextVersions: [ newVersion.id() ]
      }, function (err) {
        cb(err, newBuild);
      });
    }
    function buildBuild (newBuild, cb) {
      var newInstance;
      var count2 = createCount(2, function (err) {
        cb(err, newBuild, newInstance);
      });
      var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next);
      dispatch.on('started', function () {
        createInstanceWithBuild(newBuild, function (err, instance) {
          newInstance = instance;
          count2.next(err);
        });
      });
    }
    function createInstanceWithBuild (newBuild, cb) {
      var newInstance = ctx.user.createInstance({
        build: newBuild.id()
      }, function (err) {
        cb(err, newInstance);
      });
    }
    function tailInstance (newBuild, newInstance, cb) {
      console.log('TAIL INST');
      tailInstance(ctx.user, newInstance, cb);
    }
  });
});


function expectHipacheHostsForContainers (instance, cb) {
  var containers = instance.containers;
  var allUrls = [];
  containers.forEach(function (container) {
    if (container.ports) {
      Object.keys(container.ports).forEach(function (port) {
        var portNumber = port.split('/')[0];
        allUrls.push([instance.shortHash, '-', portNumber, '.', process.env.DOMAIN].join('').toLowerCase());
      });
    }
  });
  async.forEach(allUrls, function (url, cb) {
    var hipacheEntry = new RedisList('frontend:'+url);
    hipacheEntry.lrange(0, -1, function (err, backends) {
      if (err) {
        cb(err);
      }
      else if (backends.length !== 2 || backends[1].toString().indexOf(':') === -1) {
        cb(new Error('Backends invalid for '+url));
      }
      else {
        cb();
      }
    });
  }, cb);
}
