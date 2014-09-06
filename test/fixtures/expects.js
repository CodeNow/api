var isFunction = require('101/is-function');
var isString = require('101/is-string');
var expect = require('lab').expect;
var keypather = require('keypather')();
var debug = require('debug')('runnable-api:testing:fixtures:expects');
var exists = require('101/exists');

var expects = module.exports = function (keypath) {
  return function (val) {
    keypath.get(expect(val), keypath);
  };
};
/*jshint maxdepth:3 */
expects.success = function (statusCode, expectedKeypaths, expectedHeaders, done) {
  if (isFunction(expectedKeypaths)) {
    done = expectedKeypaths;
    expectedHeaders = null;
    expectedKeypaths = null;
  } else if (isFunction(expectedHeaders)) {
    done = expectedHeaders;
    expectedHeaders = null;
  }
  return function (err, body, code, res) {
    if (err) { return done(err); }
    expect(statusCode).to.equal(code);
    if (expectedKeypaths) {
      expect(body).to.be.ok;
      if (Array.isArray(expectedKeypaths) && expectedKeypaths.length) {
        var expectedNotFound = [];
        var allItemsFoundInBody = expectedKeypaths.every(function (expectedItem) {
          var found = body.some(function (bodyItem) {
            try {
              expectKeypaths(bodyItem, expectedItem);
              return true;
            } catch(err) {
              return false;
            }
          });
          if (!found) {
            expectedNotFound.push(expectedItem);
          }
          return found;
        });
        if (!allItemsFoundInBody) {
          throw new Error([
            'Body does not contain:', JSON.stringify(expectedNotFound),
            'Body:', JSON.stringify(body)
          ].join(' '));
        }
      } else if (Array.isArray(expectedKeypaths)) {
        expect(body).to.have.length(expectedKeypaths.length);
      } else {
        expectKeypaths(body, expectedKeypaths);
      }
    }
    if (expectedHeaders) {
      expect(res.headers).to.be.okay;
      expectKeypaths(res.headers, expectedHeaders);
    }
    done(null, body, code, res);
  };
};
/*jshint maxdepth:2 */
expects.errorStatus = function (code, messageMatch, done) {
  if (isFunction(messageMatch)) {
    done = messageMatch;
    messageMatch = null;
  }
  return function (err) {
    debug('errorStatus', err);
    expect(err).to.satisfy(exists, 'Expected error response');
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
expects.error = expects.errorStatus;

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
expects.convertObjectId = function(expected) {
  return function (val) {
    expect(val.toString()).to.eql(expected);
    return true;
  };
};

expects.expectKeypaths = expectKeypaths;

function expectKeypaths (body, expectedKeypaths) {
  if (expectedKeypaths) {
    var expected = {};
    var extracted = {};
    Object.keys(expectedKeypaths).forEach(function (keypath) {
      var expectedVal = expectedKeypaths[keypath];
      if (expectedVal instanceof RegExp) {
        expect(keypather.get(body, keypath)).to.match(expectedVal,
          'Expected body.'+keypath+'to match '+expectedVal);
      }
      else if (typeof expectedVal === 'function') {
        expect(keypather.get(body, keypath)).to.satisfy(expectedVal, 'Value for '+keypath);
      }
      else {
        keypather.set(extracted, keypath, keypather.get(body, keypath));
        keypather.set(expected, keypath, expectedVal);
      }
    });
    expect(extracted).to.eql(expected);
  }
}
