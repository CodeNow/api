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
var sinon = require('sinon');
var Dns = require('models/apis/dns');

require('loadenv')();

var Hosts = require('models/redis/hosts');

describe('Hosts', function () {
  describe('parseHostname', function () {
    var ctx = {};
    beforeEach(function (done) {
      ctx.hosts = new Hosts();
      ctx.port = '80/tcp';
      ctx.instance = { masterPod: true, owner: { github: 101 }, shortHash: 'abcdef' };
      sinon.stub(Dns.prototype, 'putEntryForInstance').yieldsAsync();
      sinon.stub(Dns.prototype, 'deleteEntryForInstance').yieldsAsync();
      keypather.set(ctx.instance, 'container.dockerHost', 'http://10.0.0.1:4242');
      keypather.set(ctx.instance, 'container.ports["80/tcp"][0].HostPort', 49201);
      keypather.set(ctx.instance, 'network.hostIp', '10.6.4.1');
      ctx.branch = 'some-branch';
      keypather.set(ctx.instance, 'contextVersion.appCodeVersions[0].lowerBranch', ctx.branch);
      keypather.set(ctx.instance, 'contextVersion.appCodeVersions[0].branch', ctx.branch);

      ctx.instanceName = ctx.branch + '-instance-name';
      ctx.username = 'user-name';
      ctx.hosts.upsertHostsForInstance(
        ctx.username, ctx.instance, ctx.instanceName, ctx.instance.container, done);
    });
    afterEach(function (done) {
      ctx.hosts.removeHostsForInstance(
        ctx.username, ctx.instance, ctx.instanceName, ctx.instance.container, done);
    });
    afterEach(function (done) {
      Dns.prototype.putEntryForInstance.restore();
      Dns.prototype.deleteEntryForInstance.restore();
      done();
    });

    it('should parse a username from a container hostname', function (done) {
      var hostname = [
        ctx.instance.shortHash, '-', ctx.instanceName, '-staging-', ctx.username, '.',
        process.env.USER_CONTENT_DOMAIN
      ].join('');
      ctx.hosts.parseHostname(hostname, function (err, parsed) {
        if (err) { return done(err); }
        expect(parsed.instanceName).to.equal(ctx.instanceName);
        expect(parsed.username).to.equal('user-name');
        done();
      });
    });
    it('should parse a username from a elastic hostname', function (done) {
      var hostname = [
        ctx.instanceName, '-staging-', ctx.username, '.',
        process.env.USER_CONTENT_DOMAIN
      ].join('');
      ctx.hosts.parseHostname(hostname, function (err, parsed) {
        if (err) { return done(err); }
        expect(parsed.instanceName).to.equal(ctx.instanceName);
        expect(parsed.username).to.equal('user-name');
        done();
      });
    });
  });
});
