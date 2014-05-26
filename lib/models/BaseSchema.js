'use strict';

var _ = require('lodash');
var exists = require('exists');
var keypather = require('keypather')();
var isFunction = require('101/is-function');
var last = require('101/last');
var noop = require('101/noop');

var BaseSchema = module.exports = {
  methods: {},
  statics: {}
};

BaseSchema.statics.create = function (data, cb) {
  if (typeof data === 'function') {
    cb = data;
    data = {};
  }
  cb = cb || noop;
  var model = new this();
  model.set(data);
  cb(null, model);
};
BaseSchema.methods.setAndSave = function () {
  var args = Array.prototype.slice.call(arguments);
  var cb;
  if (typeof _.last(args) === 'function') {
    cb = args.pop();
  }
  this.set.apply(this, args);
  this.save(cb);
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
  this.proxyCbToSortBy(args, '_id', _ids);
  this.find.apply(this, args);
};

BaseSchema.statics.findByNames = function (names) {
  names = Array.isArray(names) ? names : [names];
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ name: { $in: names } });
  this.proxyCbToSortBy(args, 'name', names);
  this.find.apply(this, args);
};

BaseSchema.methods.update = function (/* args */) {
  var args = Array.prototype.slice.call(arguments);
  var self = this;
  if (isFunction(last(args))) {
    var cb = args.pop();
    args.push(function (err) {
      cb(err, self);
    });
  }
  var superUpdate =
    Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).update;
  superUpdate.apply(this, args);
};

BaseSchema.statics.updateById = function (id /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: id });
  this.update.apply(this, args);
};

BaseSchema.statics.removeById = function (id /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: id });
  this.remove.apply(this, args);
};

BaseSchema.statics.proxyCbToSortBy = function (args, keypath, sortedVals) {
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
            if (toStringEquals(val, keypather.get(model, keypath))) {
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
};

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
