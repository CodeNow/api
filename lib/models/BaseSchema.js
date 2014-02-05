var _ = require('lodash');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

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

BaseSchema.statics.findByIds = function (_ids) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: { $in: _ids } });
  this.find.apply(this, args);
};

BaseSchema.statics.removeById = function (id /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: id });
  this.remove.apply(this, args);
};

var BaseSchema;