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
  // TODO (anton) null and undefined values are breaking code now. Investigate it
  var types = ['string', 'number', 'boolean', 'object', 'array'];//, 'null', 'undefined'];
  var typeValue = function(ctx, type) {
    var values = {
      'string': 'some-string-value',
      'number': 123, 
      'boolean': false,
      'null': null,
      'undefined': undefined,
      'object': {
        key1: 3,
        key2: 'some-val',
      },
      'array': ['val1', 'val2', 'val3'],
      'ObjectId': ctx.build.id()
    };
    return values[type];
  };
  var errorMessageSuffix = function(paramType, type) {
    if(type === 'null' || type === 'undefined') {
      return 'is required';
    }
    // TODO (anton) clarify these inconsistent messages
    var suffixes = {
      'string': 'must be a string',
      'number': 'must be a number',
      'array': 'should be an array',
      'object': 'must be an object',
      'ObjectId': 'is not an ObjectId',
    };
    return suffixes[paramType];
  };
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
    // TODO (anton) cover case when we have few required parameters
    paramTypes.forEach(function(type) {
      it('should not ' + def.action + ' when `' + param.name + '` param is ' + type, function(done) {
        var body = {};
        body[param.name] = typeValue(ctx, type);
        var message = new RegExp('body parameter "' + param.name + '" ' + errorMessageSuffix(param.type, type));
        ctx.user.createInstance(body, expects.error(400, message, done));
      });
    });
  });
  def.optionalParams.forEach(function(param) {
    var paramTypes = types.filter(function(type) {
      return type !== param.type;
    });
    paramTypes.forEach(function(type) {
      it('should not ' + def.action + ' when `' + param.name + '` param is ' + type, function(done) {
        var body = buildBodyWithRequiredParams(ctx, def.requiredParams);
        body[param.name] = typeValue(ctx, type);
        var message = new RegExp('body parameter "' + param.name + '" ' + errorMessageSuffix(param.type, type));
        ctx.user.createInstance(body, expects.error(400, message, done));
      });
    });
    if(param.type === 'array') {
      var arrayItemTypes = types.filter(function(type) {
        return type !== param.itemType;
      });
      arrayItemTypes.forEach(function(arrayItemType) {
        var testName = 'should not ' + def.action + ' when `' + param.name +
        '` param has ' + arrayItemType + ' items in the array';
        it(testName, function(done) {
          var body = buildBodyWithRequiredParams(ctx, def.requiredParams);
          body[param.name] = [];
          body[param.name].push(typeValue(ctx, arrayItemType));
          body[param.name].push(typeValue(ctx, arrayItemType));
          body[param.name].push(typeValue(ctx, arrayItemType));
          // e.g. body parameter "env" should be an array of strings
          var regexp = 'body parameter "' + param.name + '" ' + errorMessageSuffix(param.type, arrayItemType) +
          ' of ' + param.itemType + 's';
          var message = new RegExp(regexp);
          ctx.user.createInstance(body, expects.error(400, message, done));
        }); 
      });
      param.itemValues.forEach(function(itemValue) {
        var testName = 'should not ' + def.action + ' when `' + param.name +
        '` param has invalid item value such as ' + itemValue;
        it(testName, function(done) {
          var body = buildBodyWithRequiredParams(ctx, def.requiredParams);
          body[param.name] = [itemValue];
          // e.g. "env" should match 
          var message = new RegExp('"' + param.name + '" should match ');
          ctx.user.createInstance(body, expects.error(400, message, done));
        }); 
      });
    }
  });
}


function createInstanceTests (ctx) {
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));
  // NOTE:
  // there is no way to generate strings that don't match regexp
  // that is why we need to provide manually test strings that should fail
  var def = {
    action: 'create an instance',
    requiredParams: [
    {
      name: 'build',
      type: 'ObjectId'
    }],
    optionalParams: [
    {
      name: 'env',
      type: 'array',
      itemType: 'string',
      itemRegExp: /^([A-Za-z]+[A-Za-z0-9_]*)=('(\n[^']*')|("[^"]*")|([^\s#]+))$/,
      itemValues: [
        'string1',
        '1=X',
        'a!=x'
      ]
    },
    {
      name: 'name',
      type: 'string'
    }]
  };

  makeTestFromDef(def, ctx);
}