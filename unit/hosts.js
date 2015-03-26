'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var Hosts = require('models/redis/hosts');

describe('Hosts',  function () {
  it('should parse a username from a url', function (done) {
    var url = 'http://instance-name-org-name.'+process.env.USER_CONTENT_DOMAIN;
    var hosts = new Hosts();
    var name = 'instance-name';
    hosts.parseUsernameFromUrl(url, name, function (err, username) {
      if (err) { return done(err); }
      expect(username).to.equal('org-name');
      done();
    });
  });
  describe('errors', function() {
    describe('url is not url', function() {
      expectError({
        url: 'bogus',
        name: 'name'
      });
    });
    describe('url is does not end with user content domain', function() {
      expectError({
        url: 'http://hello.'+process.env.USER_CONTENT_DOMAIN+'.com',
        name: 'name'
      });
    });
    describe('url is does not contain a subdomain', function() {
      expectError({
        url: 'http://bogus.com',
        name: 'name'
      });
    });
    describe('url is does not contain name', function() {
      expectError({
        url: 'bogus.com',
        name: 'name'
      });
    });
    function expectError (args) {
      it('should callback "invalid url" error', function (done) {
        var url = args.url;
        var name = args.name;
        var hosts = new Hosts();
        hosts.parseUsernameFromUrl(url, name, function (err) {
          expect(err).to.exist();
          expect(err.message).to.match(/invalid url/i);
          done();
        });
      });
    }
  });
});