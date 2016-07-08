/**
 * @module lib/models/mongo/schemas/base
 */
'use strict'

var exists = require('101/exists')
var isFunction = require('101/is-function')
var keypather = require('keypather')()
var last = require('101/last')
var put = require('101/put')

var logger = require('middlewares/logger')(__filename)

var log = logger.log

var BaseSchema = module.exports = {
  methods: {},
  statics: {}
}

BaseSchema.methods.set = function () {
  var args = Array.prototype.slice.call(arguments)
  var cb
  if (typeof last(args) === 'function') {
    cb = args.pop()
  }
  var superSet = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).set
  superSet.apply(this, args)
  if (cb) {
    cb(null, this)
  }
}

/**
 * findOne document by keypath and val
 * @param  {string} keypath keypath to find documents with
 * @param  {*} val value of the keypath to use in the query
 * @param  {object} [fields] fields to return in query
 * @param  {object} [options] query options
 * @param  {object} cb callback
 */
BaseSchema.statics.findOneBy = function (key, val) {
  var query = {}
  query[key] = val
  var args = Array.prototype.slice.call(arguments, 2)
  args.unshift(query)
  this.findOne.apply(this, args)
}
BaseSchema.statics.findByIds = function (_ids) {
  _ids = Array.isArray(_ids) ? _ids : [_ids]
  var args = Array.prototype.slice.call(arguments, 1)
  args.unshift({ _id: { $in: _ids } })
  this.proxyCbToSortBy(args, '_id', _ids)
  this.find.apply(this, args)
}

/**
 * find documents by keypath and val
 * @param  {string} keypath keypath to find documents with
 * @param  {*} val value of the keypath to use in the query
 * @param  {object} [fields] fields to return in query
 * @param  {object} [options] query options
 * @param  {object} cb callback
 */
BaseSchema.statics.findBy = function (keypath, val /*, [fields], [options], cb */) {
  var query = {}
  query[keypath] = val
  var args = Array.prototype.slice.call(arguments, 2)
  args.unshift(query)
  this.find.apply(this, args)
}

BaseSchema.methods.update = function () {
  var args = Array.prototype.slice.call(arguments)
  var self = this
  if (isFunction(last(args))) {
    var cb = args.pop()
    args.push(function (err) {
      cb(err, self)
    })
  }
  var superUpdate =
  Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).update
  superUpdate.apply(this, args)
}

BaseSchema.statics.updateById = function (id /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1)
  args.unshift({ _id: id })
  this.update.apply(this, args)
}

/**
 * update documents by keypath and val
 * @param  {string} keypath   keypath to find documents with
 * @param  {*}      val       value of the keypath to use in the query
 * @param  {object} update    update doc
 * @param  {object} [options] query options
 * @param  {object} cb        callback
 */
BaseSchema.statics.updateBy = function (keypath, val /*, [fields], [options], cb */) {
  var query = {}
  query[keypath] = val
  var args = Array.prototype.slice.call(arguments, 2)
  args.unshift(query)
  this.update.apply(this, args)
}

BaseSchema.statics.removeById = function (id /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1)
  args.unshift({ _id: id })
  this.remove.apply(this, args)
}

BaseSchema.statics.removeByIds = function (ids /*, args*/) {
  var args = Array.prototype.slice.call(arguments, 1)
  args.unshift({ _id: { $in: ids } })
  this.remove.apply(this, args)
}

BaseSchema.statics.proxyCbToSortBy = function (args, keypath, sortedVals) {
  var cb = last(args)
  if (typeof cb === 'function') {
    args.pop()
    args.push(newCb)
  }
  function newCb (err, models) {
    if (err) {
      cb(err)
    } else {
      var sorted = sortedVals
        .map(function (val) {
          var found
          models.some(function (model, i) {
            if (toStringEquals(val, keypather.get(model, keypath))) {
              models.splice(i, 1) // remove from results set
              found = model
              return true
            }
          })
          return found
        })
        .filter(exists)
      cb(null, sorted)
    }
  }
}

/**
 * Convenience method for calling findOne for this document
 * @param  {object} extendedQuery mongo query (defaults to {}) additional query params
 *                            the query will include {_id: this._id} by default
 * @param  {object} [opts]  findOne  options
 * @param  {object} cb      callback
 */
BaseSchema.methods.findSelfWithQuery = function (extendedQuery /* [, opts], cb */) {
  log.trace({
    tx: true,
    constructor: this.constructor,
    query: extendedQuery
  }, 'findSelfWithQuery')
  var Model = this.constructor
  var args = Array.prototype.slice.call(arguments)
  var query = {
    _id: this._id
  }
  query = put(query, extendedQuery)
  log.trace({
    tx: true,
    query: query
  }, 'findSelfWithQuery')
  args.unshift(query)
  Model.findOne.apply(Model, args)
}

/**
 * Convenience method for calling findOne for this document
 * @param  {object} [opts]  findOne  options
 * @param  {object} cb      callback
 */
BaseSchema.methods.findSelf = function () {
  // args = [extendedQuery][, opts], cb
  var Model = this.constructor
  var args = Array.prototype.slice.call(arguments)
  var query = {
    _id: this._id
  }
  args.unshift(query)
  log.trace({
    tx: true,
    query: query
  }, 'findSelf')
  Model.findOne.apply(Model, args)
}

/**
 * Convenience method for calling findOneAndUpdate for this document
 * @param  {object} [extendedQuery] mongo query (defaults to {}) additional query params
 *                            the query will include {_id: this._id} by default
 * @param  {object} update  update object
 * @param  {object} [opts]  findAndModify options
 * @param  {object} cb      callback
 */
BaseSchema.methods.modifySelf = function () {
  // args: update [, opts], cb
  var Model = this.constructor
  var args = Array.prototype.slice.call(arguments)
  var query = {
    _id: this._id
  }
  args.unshift(query)
  Model.findOneAndUpdate.apply(Model, args)
}

function toStringEquals () {
  var vals = Array.prototype.slice.call(arguments)
  var last = vals.pop()
  if (vals.length === 0) {
    return true
  }
  last = last && last.toString()
  return vals.map(toString).every(equals(last))
}
function toString (v) {
  return v.toString()
}
function equals (v) {
  return function (v2) {
    return v === v2
  }
}
