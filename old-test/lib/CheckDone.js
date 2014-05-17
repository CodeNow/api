var _ = require('lodash');

var CheckDone = module.exports = function (done) {
  this.count = 0;
  this.results = [];
  this._done = done;
};
CheckDone.prototype.expectEqualResults = function () {
  this._expectResultsAreEqual = true;
};
CheckDone.prototype.assertResults = function (data) {
  if (this.equalResults) {
    var equalResultsAreEqual = this.equalResults.every(_.isEqual.bind(_, this.equalResults[0]));
    if (!equalResultsAreEqual) {
      return new Error('Expected results [ '+this.equalResults+' ] to be equal.');
    }
  }
  return null;
};
CheckDone.prototype.equal = function () {
  var self = this;
  var next = this.done();
  return function (err, data) {
    if (!err) {
      self.equalResults = self.equalResults || [];
      self.equalResults.push(data);
    }
    next(err, data);
  };
};
CheckDone.prototype.done = function () {
  this.count++;
  var self = this;
  var done = this._done;
  return function (err, data) {
    if (self.err) { // err already occurred
      return;
    }
    if (err) {
      self.err = err;
      return done(err);
    }
    self.results.push(data);
    if (self.results.length === self.count) {
      err = err || self.assertResults(data);
      done(err, data);
    }
  };
};