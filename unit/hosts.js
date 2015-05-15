'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;
var keypather = require('keypather')();

require('loadenv')();

var Hosts = require('models/redis/hosts');

describe('Hosts', function () {
  describe('parseHostname', function () {
    var ctx = {};
    beforeEach(function (done) {
      ctx.hosts = new Hosts();
      ctx.port = '80/tcp';
      ctx.instance = {};
      keypather.set(ctx.instance, 'container.dockerHost', 'http://10.0.0.1:4242');
      keypather.set(ctx.instance, 'container.ports["80/tcp"][0].HostPort', 49201);
      ctx.branch = 'somebranch';
      keypather.set(ctx.instance, 'contextVersion.appCodeVersions[0].lowerBranch', ctx.branch);

      ctx.instanceName = 'instance-name';
      ctx.username = 'user-name';
      ctx.hosts.upsertHostForContainerPort(
        ctx.port, ctx.username, ctx.instance, ctx.instanceName, done);
    });
    afterEach(function (done) {
      ctx.hosts.removeHostForContainerPort(
        ctx.port, ctx.username, ctx.instance, ctx.instanceName, done);
    });

    it('should parse a username from a hostname', function (done) {
      var hostname = [
        ctx.instanceName, '-', ctx.username, '.',
        process.env.USER_CONTENT_DOMAIN
      ].join('');
      ctx.hosts.parseHostname(hostname, function (err, parsed) {
        if (err) { return done(err); }
        expect(parsed.instanceName).to.equal('instance-name');
        expect(parsed.username).to.equal('user-name');
        done();
      });
    });
  });

  describe('parseUsernameFromHostname', function () {
    it('should parse a username from a hostname', function (done) {
      var hostname = 'instance-name-org-name.' + process.env.USER_CONTENT_DOMAIN;
      var hosts = new Hosts();
      var name = 'instance-name';
      hosts.parseUsernameFromHostname(hostname, name, function (err, username) {
        if (err) { return done(err); }
        expect(username).to.equal('org-name');
        done();
      });
    });
    it('should parse a username from an elastic hostname', function (done) {
      var hostname = 'instance-name-staging-org-name.' + process.env.USER_CONTENT_DOMAIN;
      var hosts = new Hosts();
      var name = 'instance-name';
      hosts.parseUsernameFromHostname(hostname, name, function (err, username) {
        if (err) { return done(err); }
        expect(username).to.equal('org-name');
        done();
      });
    });
    it('should parse a username from an direct hostname', function (done) {
      var hostname = 'master-instance-name-staging-org-name.' + process.env.USER_CONTENT_DOMAIN;
      var hosts = new Hosts();
      var name = 'instance-name';
      hosts.parseUsernameFromHostname(hostname, name, function (err, username) {
        if (err) { return done(err); }
        expect(username).to.equal('org-name');
        done();
      });
    });
    it('should parse a username from an direct hostname on a non master branch', function (done) {
      var hostname = 'some-cool-branch-dude-instance-name-staging-org-name.' + process.env.USER_CONTENT_DOMAIN;
      var hosts = new Hosts();
      var name = 'instance-name';
      hosts.parseUsernameFromHostname(hostname, name, function (err, username) {
        if (err) { return done(err); }
        expect(username).to.equal('org-name');
        done();
      });
    });
    describe('errors', function () {
      describe('hostname does not end with user content domain', function () {
        expectError({
          hostname: 'hello-codenow.otherdomain.com',
          name: 'name'
        });
      });
      describe('hostname does not contain a subdomain', function () {
        expectError({
          hostname: 'bogus.com',
          name: 'name'
        });
      });
      describe('hostname is does not contain name', function () {
        expectError({
          hostname: 'bogus.com',
          name: 'name'
        });
      });
      function expectError (args) {
        it('should callback "invalid hostname" error', function (done) {
          var hostname = args.hostname;
          var name = args.name;
          var hosts = new Hosts();
          hosts.parseUsernameFromHostname(hostname, name, function (err) {
            expect(err).to.exist();
            expect(err.message).to.match(/invalid hostname/i);
            done();
          });
        });
      }
    });
  });
});
