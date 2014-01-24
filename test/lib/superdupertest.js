var supertest = require('supertest');
var _ = require('lodash');
var Test = supertest.Test;
var notify = require('osx-notifier');

function notifier (err, res) {
  // var errorMsg, successMsg, stackSplit;
  // if (err && res) {
  //   if (res.body.stack) {
  //     stackSplit = res.body.stack.split('\n');
  //     var split = stackSplit[1].split('/api-server/')[1];
  //     errorMsg = {
  //       title: stackSplit[0],
  //       subtitle: split && split.slice(0, -1),
  //       message: res.body.stack
  //     };
  //   }
  //   else {
  //     stackSplit = err.stack && err.stack.split('\n');
  //     errorMsg = {
  //       title: err.message,
  //       subtitle: err.stack && stackSplit[1].split('/api-server/')[1].slice(0, -1),
  //       message: err.stack
  //     };
  //   }
  //   notify(errorMsg);
  // }
  // else {
  //   notify({
  //     type: 'pass',
  //     title: 'Test Passed!',
  //     message: 'Test Passed!'
  //   });
  // }
}

function error(msg, expected, actual) {
  var err = new Error(msg);
  err.expected = expected;
  err.actual = actual;
  err.showDiff = true;
  return err;
}

Test.prototype.expectArray = function (lengthOrMatches, strict) {
  var length, matches;
  if (typeof lengthOrMatches === 'number') {
    length = lengthOrMatches;
  }
  else {
    matches = lengthOrMatches;
  }
  if (length) {
    this._bodyIsArray = true;
    this._length = length;
  }
  if (matches) {
    var self = this;
    matches.forEach(function (match) {
      self.expectArrayContains(match, strict);
    });
  }
  return this;
};

// match:  obj
// strict: specifies whether object is an exact match (all properties) or just matching properties
Test.prototype.expectArrayContains = function (match, strict) {
  if (!this._bodyIsArray) {
    this.expectArray();
  }
  this._arrayContainsRules = this._arrayContainsRules || [];
  this._arrayContainsRules.push({
    match: match,
    strict: strict
  });
  return this;
};

Test.prototype.expectBody = function (key, value) {
  if (typeof key === 'function') {
    // (expectBodyFunction)
    this._expectBodyFunctions = this._expectBodyFunctions || [];
    this._expectBodyFunctions.push(key);
    return this;
  }
  if (typeof key === 'object') {
    // (expectedBody, strict)
    this._expectBody = {
      match: key,
      strict: value || false
    };
    return this;
  }
  this._bodyKeysExist = this._bodyKeysExist || [];
  this._bodyValues    = this._bodyValues    || {};
  if (value != null) {
    this._bodyValues[key] = value;
  }
  else {
    this._bodyKeysExist.push(key);
  }
  return this;
};

Test.prototype._checkArrayContains = function (res) {
  this._arrayContainsRules = this._arrayContainsRules || [];
  if (this._arrayContainsRules.length === 0) {
    return false;
  }
  // TODO: make this return a real error..
  var err = null;
  this._arrayContainsRules.every(function (rule) {
    if (rule.strict) {
      var pass = res.body.some(function (item) {
        return _.isEqual(item, rule.match);
      });
      if (!pass) {
        err = error('expected "res.body" array to contain an item equal to ' + JSON.stringify(rule.match));
      }
    }
    else if (!_.findWhere(res.body, rule.match)) {
      err = error('expected "res.body" array to contain a match for ' + JSON.stringify(rule.match));
    }
  });
  return err;
};

Test.prototype._checkExpectedArray = function (res) {
  var err = null;
  if (this._bodyIsArray) {
    if (!Array.isArray(res.body)) {
      err = error('expected "res.body" to be an array, got ' + JSON.stringify(res.body));
    }
    if (err) {
      return err;
    }
  }

  if (this._length) {
    if (res.body.length !== this._length) {
      err = error('expected "res.body" to be length ' + this._length + ', got ' + res.body.length);
    }
  }
  return err;
};

Test.prototype._checkExpectedBodyFunctions = function (res) {
  var tests = this._expectBodyFunctions || [];
  tests.forEach(function (test) {
    test.call(null, res.body);
  });
};

Test.prototype._checkExpectedBody = function (res) {
  if (this._expectBody) {
    var expectedBody = this._expectBody.match;
    var strict = this._expectBody.strict;
    var type = typeof expectedBody;
    if (type === 'object') {
      return checkAsObject();
    }
    if (res.body === expectedBody) {
      return false;
    }
    if (!expectedBody.test) {
      return error('expected "res.body" of "' +expectedBody+ '", got "' +res.body+ '"', expectedBody, res.body);
    }
    else { //regexp
      return checkAsRegExp();
    }
    return false;
  }
  function checkAsObject() {
    if (strict && !_.isEqual(res.body, expectedBody)) {
      return error('unexpected "res.body" strict', expectedBody, res.body);
    }
    else if (_.findWhere([res.body], expectedBody) == null) {
      if (subArraysApproxEqual()) {
        return false;
      }
      return error('unexpected "res.body"', expectedBody, res.body);
    }
    return false;
  }
  function checkAsRegExp() {
    if (expectedBody.test(res.body)) {
      return false;
    }
    else {
      return error('expected "res.body" to match ' +expectedBody+ '", got "' +res.body+ '"');
    }
  }
  function subArraysApproxEqual () {
    return Object.keys(expectedBody).every(function (key) {
      if (Array.isArray(res.body[key])) {
        return res.body[key].every(function (item) {
          return expectedBody[key].some(function (expItem) {
            return _.findWhere([item], expItem) != null;
          });
        });
      }
      else {
        return _.isEqual(expectedBody[key], res.body[key]);
      }
    });
  }
};

Test.prototype._checkExpectedBodyValues = function (res) {
  var self = this;
  // check expected bodies
  var err = null;

  var bodyKeyExists = function (key) {
    if (res.body[key] != null) {
      return true;
    }
    else {
      err = error('expected "res.body.' + key + '" to exist');
      return false;
    }
  };

  var bodyValueMatchesExpected = function (key) {
    var val = self._bodyValues[key];
    var bodyVal = res.body[key];
    if (_.isEqual(val, bodyVal)) {
      return true;
    }
    if (!val.test) {
      err = error('expected "res.body.' +key+ '" of "' +val+ '", got "' +bodyVal+ '"');
      return false;
    }
    else { //regexp
      if (val.test(bodyVal)) {
        return true;
      }
      else {
        err = error('expected "res.body.' +key+ '" to match ' +val+ '", got "' +bodyVal+ '"');
        return false;
      }
    }
  };

  if (self._bodyKeysExist) {
    self._bodyKeysExist.every(bodyKeyExists);
    if (err) {
      return err;
    }
  }

  if (self._bodyValues) {
    Object.keys(self._bodyValues).every(bodyValueMatchesExpected);
    if (err) {
      return err;
    }
  }

  return err;
};

Test.prototype._checkExpected = function (res) {
  return this._checkExpectedArray(res) ||
    this._checkArrayContains(res) ||
    this._checkExpectedBody(res) ||
    this._checkExpectedBodyValues(res) ||
    this._checkExpectedBodyFunctions(res);
};

var superEnd = Test.prototype.end;
Test.prototype.end = function (callback) {
  var self = this;

  superEnd.call(this, function (err, res) {
    err = err || self._checkExpected(res);
    if (err && res) {
      console.error('\n', res.req.method, res.req.path, res.status, res.body && res.body.message || '');
      console.error(res.body.stack || res.body);
    }
    notifier(err, res);
    if (callback) {
      callback(err, res);
    }
  });
  return this;
};

// when using request as a stream, end does not work as expected
// use streamEnd instead
Test.prototype.streamEnd = function (callback) {
  var self = this;
  this.on('error', callback);
  this.on('response', function (res) {
    self.assert(res, function (err) {
      err = err || self._checkExpected(res);
      if (err) {
        return callback(err);
      }
      callback(null, res);
    });
  });
  return this;
};

module.exports = supertest;