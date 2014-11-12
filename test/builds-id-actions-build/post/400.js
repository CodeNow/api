var Lab = require('lab');
var describe = Lab.experiment;

var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;


var api = require('./../../fixtures/api-control');
var dock = require('./../../fixtures/dock');
var multi = require('./../../fixtures/multi-factory');
var typesTests = require('../../fixtures/types-test-util');

describe('400 POST /builds/:id/actions/build', function() {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  describe('invalid types', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.contextVersion = contextVersion;
        ctx.context = context;
        ctx.build = build;
        ctx.user = user;
        done(err);
      });
    });
    var def = {
      action: 'build a build',
      optionalParams: [
        {
          name: 'message',
          type: 'string',
        }
      ],
    };

    typesTests.makeTestFromDef(def, ctx, function (body, cb) {
      ctx.build.build(body, cb);
    });
    
  });

});
