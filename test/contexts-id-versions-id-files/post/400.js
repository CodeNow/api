var Lab = require('lab');
var describe = Lab.experiment;

var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;

var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');

var typesTests = require('../../fixtures/types-test-util');

describe('400 POST /contexts/:contextid/versions/:id/files', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  var dirPathName = 'dir[]()';

  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user){
      if (err) { return done(err); }
      ctx.build = build;
      ctx.env = env;
      ctx.project = project;
      ctx.user = user;
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      ctx.files = ctx.contextVersion.rootDir.contents;
      ctx.files.fetch({ path: '/' }, function (err) {
        if (err) { return done(err); }
        ctx.file = ctx.files.models[0];
        ctx.fileId = ctx.file.id();
        ctx.dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
        require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
        require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName + '/');
        ctx.dir = ctx.files.createDir(dirPathName, done);
      });
    });
  });


  describe('invalid types', function () {
    var def = {
      action: 'create a file',
      optionalParams: [
        {
          name: 'body',
          type: 'string'
        },
        {
          name: 'name',
          type: 'string'
        },
        {
          name: 'isDir',
          type: 'boolean'
        },
        // TODO (anton) had some problem with path testing
        // {
        //   name: 'path',
        //   type: 'string'
        // }
      ]
    };



    typesTests.makeTestFromDef(def, ctx, function (body, cb) {
      require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
      require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt');
      ctx.contextVersion.rootDir.contents.create({json: body}, cb);
    });

    
  });
  
});
