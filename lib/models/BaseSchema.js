var _ = require('lodash');

var BaseSchema = module.exports = {
  methods: {},
  statics: {}
};

BaseSchema.statics.create = function (data, cb) {
  if (typeof data === 'function') {
    cb = data;
    data = {};
  }
  var model = new this();
  model.set(data);
  cb(null, model);
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
