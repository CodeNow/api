var Lab = require('lab');
var describe = Lab.experiment;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var typesTests = require('../../fixtures/types-test-util');

describe('400  POST /instances/:id/actions/copy', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      done();
    });
  });


  describe('invalid types', function () {
    var def = {
      action: 'copy the instance',
      optionalParams: [
      {
        name: 'name',
        type: 'string',
        invalidValues: [
          'has!',
          'has.x2'
        ]
      }]
    };

    typesTests.makeTestFromDef(def, ctx, function(body, cb) {
      ctx.instance.copy({ json: body }, cb);
    });

  });
});
