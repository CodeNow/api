var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var exists = require('101/exists');
var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var extend = require('extend');

var invalidEnvLine = /body parameter "env" should be an array of strings/;
var invalidEnvLineStr = /\"env\" should match/;

describe('400 POST /instances', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  function initExpected (done) {
    ctx.expected = {
      _id: exists,
      shortHash: exists,
      'createdBy.github': ctx.user.attrs.accounts.github.id,
      'build._id': ctx.build.id(),
      name: exists,
      env: [],
      owner: {
        username: ctx.user.json().accounts.github.login,
        github: ctx.user.json().accounts.github.id
      },
      contextVersions: exists,
      'contextVersions[0]._id': ctx.cv.id(),
      // 'contextVersions[0].appCodeVersions[0]': ctx.cv.attrs.appCodeVersions[0],
      'network.networkIp': exists,
      'network.hostIp': exists
    };
    done();
  }

  describe('with in-progress build', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.build = build;
        ctx.user = user;
        ctx.cv = contextVersion;
        // mocks for build
        ctx.build.build({ message: uuid() }, expects.success(201, done));
      });
    });
    beforeEach(initExpected);
    afterEach(function (done) {
      var instance = ctx.instance;
      multi.tailInstance(ctx.user, instance, function (err) {
        if (err) { return done(err); }
        expect(instance.attrs.containers[0]).to.be.okay;
        var count = createCount(done);
        expects.updatedHipacheHosts(
          ctx.user, instance, count.inc().next);
        var container = instance.containers.models[0];
        expects.updatedWeaveHost(
          container, instance.attrs.network.hostIp, count.inc().next);
      });
    });
    createInstanceTests(ctx);
  });
  describe('with built build', function () {
    describe('Long running container', function() {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelsArr) {
          ctx.build = build;
          ctx.user = user;
          ctx.cv = modelsArr[0];
          done(err);
        });
      });
      beforeEach(initExpected);
      beforeEach(function (done) {
        extend(ctx.expected, {
          containers: exists,
          'containers[0]': exists,
          'containers[0].dockerHost': exists,
          'containers[0].dockerContainer': exists,
          'containers[0].inspect.State.Running': true
        });
        done();
      });
      afterEach(function (done) {
        var instance = ctx.instance;
        var count = createCount(done);
        expects.updatedHipacheHosts(
          ctx.user, instance, count.inc().next);
        var container = instance.containers.models[0];
        expects.updatedWeaveHost(
          container, instance.attrs.network.hostIp, count.inc().next);
      });

      createInstanceTests(ctx);
    });
    describe('Immediately exiting container', function() {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelsArr) {
          ctx.build = build;
          ctx.user = user;
          ctx.cv = modelsArr[0];
          done(err);
        });
      });
      beforeEach(initExpected);
      beforeEach(function (done) {
        extend(ctx.expected, {
          containers: exists,
          'containers[0]': exists,
          'containers[0].dockerHost': exists,
          'containers[0].dockerContainer': exists,
          'containers[0].inspect.State.Running': false
        });
        done();
      });
      beforeEach(function (done) {
        ctx.originalStart = Docker.prototype.startContainer;
        Docker.prototype.startContainer = function () {
          var self = this;
          var args = Array.prototype.slice.call(arguments);
          var container = args[0];
          var cb = args.pop();
          args.push(stopContainer);
          return ctx.originalStart.apply(this, args);
          function stopContainer (err, start) {
            if (err) { return cb(err); }
            self.stopContainer(container, function (err) {
              cb(err, start);
            });
          }
        };
        done();
      });
      afterEach(function (done) {
        Docker.prototype.startContainer = ctx.originalStart;
        done();
      });

      createInstanceTests(ctx);
    });
  });
});



function makeTestFromDef(def, ctx) {
  var types = ['string', 'number', 'boolean', 'object', 'array'];
  var typeValue = function(ctx, type) {
    var values = {
      'string': 'some-string-value',
      'number': 123, 
      'boolean': false,
      'object': {
        key1: 3,
        key2: 'some-val',
      },
      'array': ['val1', 'val2', 'val3'],
      'ObjectId': ctx.build.id()
    };
    return values[type];
  };
  var errorMessageSuffix = {
    'string': 'must be a string',
    'number': 'must be a number',
    'array': 'must be an array',
    'object': 'must be an object',
    'ObjectId': 'is not an ObjectId',
  }
  var buildBodyWithRequiredParams = function(ctx, requiredParams) {
    var body = {};
    requiredParams.forEach(function(requiredParam) {
      body[requiredParam.name] = typeValue(ctx, requiredParam.type);
    });
    return body;
  };
  def.requiredParams.forEach(function(param) {
    var paramTypes = types.filter(function(type) {
      return type !== param.type;
    });
    paramTypes.forEach(function(type) {
      it('should ' + def.action + ' when ' + param.name + ' is ' + type, function(done) {
        var body = {};
        body[param.name] = typeValue(ctx, type);
        var message = new RegExp('body parameter "' + param.name + '" ' + errorMessageSuffix[param.type]);
        ctx.user.createInstance(body, expects.error(400, message, done));
      });
    })
  });
  def.optionalParams.forEach(function(param) {
    var paramTypes = types.filter(function(type) {
      return type !== param.type;
    });
    paramTypes.forEach(function(type) {
      it('should ' + def.action + ' when ' + param.name + ' is ' + type, function(done) {
        var body = buildBodyWithRequiredParams(ctx, def.requiredParams);
        body[param.name] = typeValue(ctx, type);
        var message = new RegExp('body parameter "' + param.name + '" ' + errorMessageSuffix[param.type]);
        ctx.user.createInstance(body, expects.error(400, message, done));
      });
    })
  });
}


function createInstanceTests (ctx) {
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));
  var def = {
    action: 'create an instance',
    requiredParams: [
    {
      name: 'build',
      type: 'ObjectId'
    }],
    optionalParams: [
    {
      name: 'name',
      type: 'string'
    }]
  };

  makeTestFromDef(def, ctx);
  
  it('should not create an instance if env is string', function (done) {
    var env = 'FOO=BAR';
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, /body parameter "env" should be an array/, done));
  });
  it('should not create an instance if env is number', function (done) {
    var env = 3;
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, /body parameter "env" should be an array/, done));
  });
  it('should not create an instance if env is boolean', function (done) {
    var env = false;
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, /body parameter "env" should be an array/, done));
  });
  it('should not create an instance if env is object', function (done) {
    var env = {key: 3};
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, /body parameter "env" should be an array/, done));
  });
  it('should not create an instance if env array has numbers', function (done) {
    var env = [1, 2, 3];
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, invalidEnvLine, done));
  });
  it('should not create an instance if env array has booleans', function (done) {
    var env = [false, true, false];
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, invalidEnvLine, done));
  });
  it('should not create an instance if env array has objects', function (done) {
    var env = [{name: 1}, {name: 2}, {name: 3}];
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, invalidEnvLine, done));
  });
  it('should not create an instance if env array has invlaid strings', function (done) {
    var env = ["STRING1", "STRING2", "STRING3"];
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, invalidEnvLineStr, done));
  });
  it('should not create an instance if env array has string starting from numbers', function (done) {
    var env = ["1=X", "2=x", "3=x"];
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, invalidEnvLineStr, done));
  });
  it('should not create an instance if env array has special characters in the keys', function (done) {
    var env = ["a!=X", "a!=x", "a3=x"];
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.error(400, invalidEnvLineStr, done));
  });
}