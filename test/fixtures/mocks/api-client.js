var Instance = require('runnable/lib/models/instance');
var Build = require('runnable/lib/models/build');
var ExpressRequest = require('express-request');

// TODO: make this less hardcoded

var original = {};

module.exports.setup = function (cb) {
  // INSTANCE
  original['instance.create'] = Instance.prototype.create;
  Instance.prototype.create = function () {
    if (!(this.opts.client.request instanceof ExpressRequest)) {
      require('../../fixtures/mocks/github/user')(this.opts.user);
      require('../../fixtures/mocks/github/user')(this.opts.user);
    }
    original['instance.create'].apply(this, arguments);
  };
  original['instance.update'] = Instance.prototype.update;
  // BUILD
  original['build.build'] = Build.prototype.build;
  Build.prototype.build = function () {
    if (!(this.opts.client.request instanceof ExpressRequest)) {
      require('../../fixtures/mocks/github/user')(this.opts.user);
      require('../../fixtures/mocks/github/user')(this.opts.user);
      require('../../fixtures/mocks/docker/container-id-attach')(20);
      require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(this.contextVersions.models[0]);
    }
    original['build.build'].apply(this, arguments);
  };
  cb();
};

module.exports.clean = function (cb) {
  // INSTANCE
  Instance.prototype.create = original['instance.create'];
  // BUILD
  Build.prototype.build = original['build.build'];
  cb();
};