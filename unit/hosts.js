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
});