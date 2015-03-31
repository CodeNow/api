'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var Hosts = require('models/redis/hosts');

describe('Hosts',  function () {

  describe('parseInstanceNameFromHostname', function() {

    it('should parse a username from a hostname', function (done) {
      var hostname = 'instance-name-org-name.'+process.env.USER_CONTENT_DOMAIN;
      var hosts = new Hosts();
      var username = 'org-name';
      hosts.parseInstanceNameFromHostname(hostname, username, function (err, instanceName) {
        if (err) { return done(err); }
        expect(instanceName).to.equal('instance-name');
        done();
      });
    });
  });

  describe('parseUsernameFromHostname', function() {

    it('should parse a username from a hostname', function (done) {
      var hostname = 'instance-name-org-name.'+process.env.USER_CONTENT_DOMAIN;
      var hosts = new Hosts();
      var name = 'instance-name';
      hosts.parseUsernameFromHostname(hostname, name, function (err, username) {
        if (err) { return done(err); }
        expect(username).to.equal('org-name');
        done();
      });
    });
    describe('errors', function() {
      describe('hostname is does not end with user content domain', function() {
        expectError({
          hostname: 'hello-codenow.otherdomain.com',
          name: 'name'
        });
      });
      describe('hostname is does not contain a subdomain', function() {
        expectError({
          hostname: 'bogus.com',
          name: 'name'
        });
      });
      describe('hostname is does not contain name', function() {
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
