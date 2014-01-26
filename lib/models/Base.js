var _ = require('lodash');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var BaseSchema = module.exports = new Schema({});

BaseSchema.methods.set = function (/* args.., cb */) {
  cb = _.last(arguments);
  Object.getPrototypeOf(Object.getPrototypeOf(
    Object.getPrototypeOf(this))).set.apply(this, arguments);
  if (typeof cb === 'function') { // make set async so it works with model middleware
    cb(null, this);
  }
};
BaseSchema.statics.removeById = function (id /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: id });
  this.remove.apply(this, args);
};

var Base = module.exports = mongoose.model('__base_class__', BaseSchema);