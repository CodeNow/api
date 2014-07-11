var isFunction = require('101/is-function');
var isString = require('101/is-string');
var expect = require('lab').expect;
var debug = require('debug')('runnable-api:testing:fixtures:expects');

var expects = module.exports = {};

expects.success = function (statusCode, json, done) {
  if (isFunction(json)) {
    done = json;
    json = null;
  }
  return function (err, body, code) {
    if (err) { return done(err); }
    expect(statusCode).to.equal(code);
    json = json || {};
    Object.keys(json).forEach(function (key) {
      expect(body).to.have.property(key, json[key]);
    });
    done();
  };
};

expects.errorStatus = function (code, messageMatch, done) {
  if (isFunction(messageMatch)) {
    done = messageMatch;
    messageMatch = null;
  }
  return function (err) {
    debug('errorStatus', err);
    expect(err).to.be.ok;
    expect(err.output.statusCode).to.equal(code);
    if (messageMatch instanceof RegExp) {
      expect(err.message).to.match(messageMatch);
    }
    else if (isString(messageMatch)) {
      expect(err.message).to.equal(messageMatch);
    }
    done();
  };
};

expects.updateSuccess = function (json, done) {
  return function (err, body, code) {
    if (err) { return done(err); }
    expect(code).to.equal(200);
    Object.keys(json).forEach(function (key) {
      expect(body).to.have.property(key, json[key]);
    });
    done();
  };
};
