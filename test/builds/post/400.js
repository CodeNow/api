var Lab = require('lab');
var describe = Lab.experiment;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');

var typesTests = require('../../fixtures/types-test-util');

describe('400 POST /builds', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  beforeEach(function (done) {
    ctx.user = multi.createUser(done);
  });

  describe('invalid types', function () {
    var def = {
      action: 'create a build',
      requiredParams: [
        {
          name: 'owner',
          type: 'object',
          keys: [
            {
              name: 'github',
              type: 'number'
            }
          ]
        }
      ],
    };

    typesTests.makeTestFromDef(def, ctx, function (body, cb) {
      ctx.user.createBuild(body, cb);
    });
  });

});