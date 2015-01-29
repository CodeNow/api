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
var normalJsonPaylod = require('./fixtures/json-515kb');
var bigJsonPaylod = require('./fixtures/json-645kb');
var dock = require('./fixtures/dock');
var url = require('url');
var nock = require('nock');
var generateKey = require('./fixtures/key-factory');

before(function (done) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  done();
});

describe('JSON body parser', function () {
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

  it('should be able to parse json less than 600kb', function (done) {
    var uri = url.format({
      protocol: 'http:',
      slashes: true,
      host: process.env.ROOT_DOMAIN,
      pathname: 'actions/github'
    });
    var headers = {
      host: process.env.ROOT_DOMAIN,
      accept: '*/*',
      'user-agent': 'GitHub Hookshot 3e70583',
      'x-github-event': 'ping',
      'x-github-delivery': 'e05eb1f2-fbc7-11e3-8e1d-423f213c5718',
      'content-type': 'application/json'
    };
    request.post({url: uri, headers: headers, json: normalJsonPaylod}, function (err, res) {
      if (err) { return done(err); }
      expect(res.statusCode).to.equal(202);
      done();
    });
  });

  it('should fail to parse json more than 600kb', function (done) {
    var uri = url.format({
      protocol: 'http:',
      slashes: true,
      host: process.env.ROOT_DOMAIN,
      pathname: 'actions/github'
    });
    var headers = {
      host: process.env.ROOT_DOMAIN,
      accept: '*/*',
      'user-agent': 'GitHub Hookshot 3e70583',
      'x-github-event': 'ping',
      'x-github-delivery': 'e05eb1f2-fbc7-11e3-8e1d-423f213c5718',
      'content-type': 'application/json'
    };
    request.post({url: uri, headers: headers, json: bigJsonPaylod}, function (err, res, body) {
      if (err) { return done(err); }
      expect(res.statusCode).to.equal(500);
      expect(body.message).to.equal('An internal server error occurred');
      done();
    });
  });


});
