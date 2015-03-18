'use strict';

// TODO: @tj comment up? :)

var exists = require('101/exists');
var last = require('101/last');
var keypather = require('keypather')();
var isFunction = require('101/is-function');
var last = require('101/last');
var debug = require('debug')('runnable-api:model:base');

var BaseSchema = module.exports = {
  methods: {},
  statics: {}
};
// TODO: @TJ - we do a lot of creates, but that's a method, not static?
// BaseSchema.statics.create = function (data, cb) {
//   if (typeof data === 'function') {
//     cb = data;
//     data = {};
//   }
//   cb = cb || noop;
//   var model = new this();
//   model.set(data);
//   cb(null, model);
// };
BaseSchema.methods.set = function () {
  var args = Array.prototype.slice.call(arguments);
  var cb;
  if (typeof last(args) === 'function') {
    cb = args.pop();
  }
  var superSet = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).set;
  superSet.apply(this, args);
  if (cb) {
    cb(null, this);
  }
};
// BaseSchema.methods.unset = function (key, cb) {
//   this.set(key, undefined, cb);
// };
/**
 * findOne document by keypath and val
 * @param  {string} keypath keypath to find documents with
 * @param  {*} val value of the keypath to use in the query
 * @param  {object} [fields] fields to return in query
 * @param  {object} [options] query options
 * @param  {object} cb callback
 */
BaseSchema.statics.findOneBy = function (key, val) {
  var query = {};
  query[key] = val;
  var args = Array.prototype.slice.call(arguments, 2);
  args.unshift(query);
  this.findOne.apply(this, args);
};
BaseSchema.statics.findByIds = function (_ids) {
  _ids = Array.isArray(_ids) ? _ids : [_ids];
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: { $in: _ids } });
  this.proxyCbToSortBy(args, '_id', _ids);
  this.find.apply(this, args);
};

// BaseSchema.statics.findByNames = function (names) {
//   names = Array.isArray(names) ? names : [names];
//   var args = Array.prototype.slice.call(arguments, 1);
//   args.unshift({ name: { $in: names } });
//   this.proxyCbToSortBy(args, 'name', names);
//   this.find.apply(this, args);
// };

/**
 * find documents by keypath and val
 * @param  {string} keypath keypath to find documents with
 * @param  {*} val value of the keypath to use in the query
 * @param  {object} [fields] fields to return in query
 * @param  {object} [options] query options
 * @param  {object} cb callback
 */
BaseSchema.statics.findBy = function (keypath, val /*, [fields], [options], cb */) {
  var query = {};
  query[keypath] = val;
  var args = Array.prototype.slice.call(arguments, 2);
  args.unshift(query);
  this.find.apply(this, args);
};

/* query - mongo query,
 * fields - object for mongo fields to select
 * popQuery - space seperated list of fields to populate */
BaseSchema.statics.findAndPopulate = function (/* query, fields, options, popQuery, cb */) {
  var args = Array.prototype.slice.call(arguments);
  var cb = args.pop();
  var popQuery = args.pop();
  var query = args.length ? args.shift() : null;
  var fields = args.length ? args.shift() : null;
  var options = args.length ? args.shift() : null;
  debug('finding and populating', query, fields, options, popQuery);
  this
    .find(query, fields, options)
    .populate(popQuery)
    .exec(function (err, data) {
      debug('find and populate result', err);
      cb(err, data);
    });
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

/**
 * update documents by keypath and val
 * @param  {string} keypath   keypath to find documents with
 * @param  {*}      val       value of the keypath to use in the query
 * @param  {object} update    update doc
 * @param  {object} [options] query options
 * @param  {object} cb        callback
 */
BaseSchema.statics.updateBy = function (keypath, val /*, [fields], [options], cb */) {
  var query = {};
  query[keypath] = val;
  var args = Array.prototype.slice.call(arguments, 2);
  args.unshift(query);
  this.update.apply(this, args);
};

BaseSchema.statics.removeById = function (id /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: id });
  this.remove.apply(this, args);
};

BaseSchema.statics.removeByIds = function (ids /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ _id: { $in: ids }});
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
