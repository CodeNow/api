'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');

var nock = require('nock');
var generateKey = require('./fixtures/key-factory');

before(function (done) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  done();
});

describe('Actions - /actions/redirect', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));


  it('should not redirect non-github url', function (done) {
    var url = 'http://localhost:' + process.env.PORT + '/actions/redirect?url=http://google.com';
    var options = {
      method: 'GET',
      url: url
    };
    request(options, function (err, res) {
      if (err) { return done(err); }
      expect(res.statusCode).to.equal(404);
      done();
    });
  });

  it('should redirect github url', function (done) {
    var repo = decodeURIComponent('https://github.com/podviaznikov/hellonode');
    var url = 'http://localhost:' + process.env.PORT + '/actions/redirect?url=' + repo;
    var options = {
      method: 'GET',
      url: url,
      followRedirect: false
    };
    request(options, function (err, res) {
      if (err) { return done(err); }
      expect(res.statusCode).to.equal(302);
      expect(res.body).to.equal('Moved Temporarily. Redirecting to https://github.com/podviaznikov/hellonode');
      done();
    });
  });

});