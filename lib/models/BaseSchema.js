var _ = require('lodash');
var utils = require('middleware/utils');
var exists = require('exists');

var BaseSchema = module.exports = {
  methods: {},
  statics: {}
};

BaseSchema.methods.set = function () {
  var args = Array.prototype.slice.call(arguments);
  var cb;
  if (typeof _.last(args) === 'function') {
    cb = args.pop();
  }
  var superSet = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).set;
  superSet.apply(this, args);
  if (cb) {
    cb(null, this);
  }
};
BaseSchema.methods.unset = function (key, cb) {
  this.set(key, undefined, cb);
};

BaseSchema.statics.findByIds = function (_ids) {
  _ids = Array.isArray(_ids) ? _ids : [_ids];
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: { $in: _ids } });
  proxyCbToSortBy(args, '_id', _ids);
  this.find.apply(this, args);
};

BaseSchema.statics.findByNames = function (names) {
  names = Array.isArray(names) ? names : [names];
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ name: { $in: names } });
  proxyCbToSortBy(args, 'name', names);
  this.find.apply(this, args);
};

BaseSchema.statics.removeById = function (id /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: id });
  this.remove.apply(this, args);
};


function proxyCbToSortBy(args, key, sortedVals) {
  var cb = last(args);
  if (typeof cb === 'function') {
    args.pop();
    args.push(newCb);
  }
  function newCb (err, models) {
    if (err) {
      cb(err);
    }
    else {
      var sorted = sortedVals
        .map(function (val) {
          var found;
          models.some(function (model, i) {
            if (toStringEquals(val, model[key])) {
              models.splice(i, 1); // remove from results set
              found = model;
              return true;
            }
          });
          return found;
        })
        .filter(exists);
      cb(null, sorted);
    }
  }
}

function last (a) {
  return a[a.length -1];
}
function toStringEquals (/* vals */) {
  var vals = Array.prototype.slice.call(arguments);
  var last = vals.pop();
  if (vals.length === 0) {
    return true;
  }
  last = last && last.toString();
  return vals.map(toString).every(equals(last));
}
function toString (v) {
  return v.toString();
}
function equals (v) {
  return function (v2) {
    return v === v2;
  };
}
