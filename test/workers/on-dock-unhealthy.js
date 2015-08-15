'use strict';

require('loadenv')();

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var Code = require('code');
var expect = Code.expect;

var api = require('../fixtures/api-control');
var dock = require('../fixtures/dock');
var multi = require('../fixtures/multi-factory');
var primus = require('../fixtures/primus');
var hermesClient = require('hermes-private').hermesSingletonFactory({
  hostname: process.env.RABBITMQ_HOSTNAME,
  password: process.env.RABBITMQ_PASSWORD,
  port: process.env.RABBITMQ_PORT,
  username: process.env.RABBITMQ_USERNAME
}).connect();

var docker = require('../fixtures/docker');
process.env.AUTO_RECONNECT = false; // needed for test
process.env.HOST_TAGS='default'; // needed for test
var dockerListener = require('docker-listener');
var dockerHost = require('../fixtures/docker-host');
var ip = require('ip');

describe('on-dock-unhealthy functional test', function () {
  var ctx = {};
  var testDock2Port = 4808;
  var testDockerListner2Port = 9999;
  var testDock2Url = 'http://'+ip.address() + ':' + testDock2Port;

  before(dock.start.bind(ctx));
  before(api.start.bind(ctx));

  beforeEach(require('../fixtures/clean-mongo').removeEverything);
  beforeEach(primus.connect);

  afterEach(primus.disconnect);
  afterEach(require('../fixtures/clean-ctx')(ctx));

  after(dock.stop.bind(ctx));
  after(api.stop.bind(ctx));

  describe('one instance', function() {
    beforeEach(function (done) {
      multi.createAndTailInstance(primus, function (err, instance, build, user) {
        if (err) { return done(err); }
        ctx.user = user;
        ctx.instance = instance;
        expect(instance.attrs.container.dockerHost).to.equal(dockerHost);
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });
    });
    beforeEach(function (done) {
      process.env.DOCKER_REMOTE_API_PORT = testDock2Port;
      ctx.docker = docker.start(testDock2Port, function (err) {
        if (err) { return done(err); }
        dockerListener.start(testDockerListner2Port, done);
      });
    });
    afterEach(function (done) {
      process.env.DOCKER_REMOTE_API_PORT = dockerHost;
      done();
    });

    it('should redeploy to new dock', function(done) {
      primus.expectAction('start', function () {
        ctx.instance.fetch(function (err, i) {
          expect(i.container.dockerHost).to.equal(testDock2Url);
          done();
        });
      });
      require('../fixtures/mocks/github/action-auth')
        (process.env.HELLO_RUNNABLE_GITHUB_TOKEN, ctx.user.attrs.accounts.github.id);
      require('../fixtures/mocks/github/user')
        (ctx.user.attrs.accounts.github.id, undefined, process.env.HELLO_RUNNABLE_GITHUB_TOKEN);

      hermesClient.publish('on-dock-unhealthy', { host: dockerHost });
    });
  }); // end one instance
}); // end on-dock-unhealthy functional test