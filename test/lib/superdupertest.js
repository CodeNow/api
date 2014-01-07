var supertest = require('supertest');
var Test = supertest.Test;

function error(msg, expected, actual) {
  var err = new Error(msg);
  err.expected = expected;
  err.actual = actual;
  err.showDiff = true;
  return err;
}

Test.prototype.expectArray = function () {
  this._bodyIsArray = true;
  return this;
};

Test.prototype.expectBody = function (key, value) {
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

var superEnd = Test.prototype.end;

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
    if (val === bodyVal) {
      return true;
    }
    if (!val.test) {
      err = error('expected "res.body.' +key+ '" of "' +val+ '", got "' +bodyVal+ '"', val, bodyVal);
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

  if (self._bodyIsArray) {
    if (!Array.isArray(res.body)) {
      err = error('expected "res.body" to be an array, got', res.body);
    }
    if (err) {
      return err;
    }
  }

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

Test.prototype.end = function (callback) {
  var self = this;

  superEnd.call(this, function (err, res) {
    err = err || self._checkExpectedBodyValues(res);
    if (err && res) {
      console.error('\n', res.body);
    }
    if (callback) {
      callback(err, res);
    }
  });
};

// when using request as a stream, end does not work as expected
// use streamEnd instead
Test.prototype.streamEnd = function (callback) {
  var self = this;
  this.on('error', callback);
  this.on('response', function (res) {
    self.assert(res, function (err) {
      err = err || self._checkExpectedBodyValues(res);
      if (err) {
        return callback(err);
      }
      callback(null, res);
    });
  });
};

module.exports = supertest;