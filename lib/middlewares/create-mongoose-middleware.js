/**
 * Create a middleware function wrapping basic model functionality for clean
 * inclusion of model logic in request route handlers
 * @module lib/middlewares/create-mongoose-middleware
 */
'use strict'

var async = require('async')
var checkFound = require('middlewares/check-found')
var extend = require('extend')
var flow = require('middleware-flow')
var inflect = require('i')()
var isObject = require('101/is-object')
var omit = require('101/omit')
var url = require('url')
var utils = require('middlewares/utils')

var camelize = function (str) {
  return inflect.camelize(inflect.underscore(str), false)
}

/**
 * @return {Object} - constructor function
 */
function getModelMiddlewareClass () {
  var MongooseModelMiddleware = function () {}
  MongooseModelMiddleware.prototype = {} // placeholder for the bound mongoose extended methods
  var ModelMiddleware = function (Model, key) {
    if (typeof Model === 'string') {
      key = Model
      Model = null
    }
    if (Model) {
      Model = Model
      var modelName = Model.modelName
      this.Model = Model
      this.key = key || camelize(utils.singularize(modelName))
      this.pluralKey = utils.pluralize(this.key)
      this.extendModel()
    } else {
      this.key = key
      this.pluralKey = utils.pluralize(this.key)
    }
    this.setBoundProto()
    this.super = Object.getPrototypeOf(this)
  }
  ModelMiddleware.prototype = new MongooseModelMiddleware()
  /**
   * - extendModel
   * - extendModelInstance
   * - setBoundProto
   */
  extend(ModelMiddleware.prototype, {
    extendModel: function () {
      var self = this
      var parentProto = Object.getPrototypeOf(Object.getPrototypeOf(this))
      var Model = this.Model
      var staticMethods = Object.keys(Model.schema.statics)
      var protoMethods = Object.keys(Object.getPrototypeOf(Model))
      var methods = protoMethods.concat(staticMethods)
      methods.forEach(function (method) {
        parentProto[method] = function () {
          var args = Array.prototype.slice.call(arguments)
          var mw = function (req, res, next) {
            var localArgs = utils.replacePlaceholders(req, args)
            var keyOverride = method.indexOf('update') === 0 ? 'numberUpdated' : null
            localArgs.push(self.dbCallback(req, next, keyOverride))
            var Model = self.Model
            req.domain.run(function () {
              Model[method].apply(Model, localArgs)
            })
            req[self.key + 'LastQuery'] = localArgs[0]
          }
          mw.name = Model.modelName + '.' + method
          return mw
        }
        parentProto[method].name = method
      })
      parentProto.dbCallback = function (req, next, keyOverride) {
        var self = this
        return function (err, data) {
          if (err) {
            next(err)
          } else {
            var key = keyOverride || Array.isArray(data) ? self.pluralKey : self.key
            req[key] = data
            next()
          }
        }
      }
      this.extendModelInstance()
    },
    extendModelInstance: function () {
      var model = new this.Model()
      function getKeys () {
        var modelProto = Object.getPrototypeOf(model)
        var modelProtoProto = Object.getPrototypeOf(modelProto)
        var modelProtoProtoProto = Object.getPrototypeOf(modelProtoProto)
        var modelProtoProtoProtoProto = Object.getPrototypeOf(modelProtoProtoProto)
        var modelProtoProtoProtoProtoProto = Object.getPrototypeOf(modelProtoProtoProtoProto)
        return Object.keys(model)
          .concat(Object.keys(modelProto))
          .concat(Object.keys(modelProtoProto))
          .concat(Object.keys(modelProtoProtoProto))
          .concat(Object.keys(modelProtoProtoProtoProto))
          .concat(Object.keys(modelProtoProtoProtoProtoProto))
      }
      this.model = {}
      this.models = {}
      var self = this
      var modelMethodNames = getKeys()
      modelMethodNames.forEach(function (method) {
        self.model[method] = function () {
          var args = Array.prototype.slice.call(arguments)
          var mw = function (req, res, next) {
            var localArgs = utils.replacePlaceholders(req, args)
            var keyOverride = method.indexOf('update') === 0 ? 'numberUpdated' : null
            localArgs.push(self.dbCallback(req, next, keyOverride))
            var model = req[self.key]
            req.domain.run(function () {
              if (!model) {
                throw new Error(self.key + ' is undefined (at ' + method + ')')
              } else if (!model[method]) {
                throw new Error(model + '(' + self.key + ') has no method "' + method + '"')
              }
              model[method].apply(model, localArgs)
            })
            req[self.key + 'LastQuery'] = localArgs[0]
          }
          mw.name = self.Model.modelName + '.model.' + method
          return mw
        }
        self.models[method] = function () {
          var args = Array.prototype.slice.call(arguments)
          var mw = function (req, res, next) {
            var localArgs = utils.replacePlaceholders(req, args)
            var models = req[self.pluralKey]
            req.domain.run(function () {
              async.map(models, function (model, cb) {
                var methodArgs = localArgs.concat(cb) // new array
                if (!model[method]) {
                  var usage = [self.pluralKey, 'models', method].join('.')
                  throw new Error(
                    model + '(' + self.key + ') has no instance method "' + method + '" (' + usage + ')')
                }
                model[method].apply(model, methodArgs)
              }, self.dbCallback(req, next))
            })
            req.lastQuery = localArgs[0]
          }
          mw.name = self.Model.modelName + '.models.' + method
          return mw
        }
      })
    },
    setBoundProto: function () {
      var proto = Object.getPrototypeOf(this)
      extend(proto, getBoundPrototype(this))
      proto.super = Object.getPrototypeOf(proto)
    }
  })
  function getBoundPrototype (self) {
    return {
      findPage: function (queryArg, fieldsArg) {
        var self = this
        return function (req, res, next) {
          var query = utils.replacePlaceholders(req, queryArg)
          var fields = utils.replacePlaceholders(req, fieldsArg)
          // paging starts at 1 from the user's perspective
          var limit = query.limit
          var opts = {
            limit: limit,
            skip: (query.page ? query.page - 1 : 0) * limit,
            sort: query.sort
          }
          var mongoQuery = omit(query, ['sort', 'page', 'limit'])
          var Model = self.Model
          async.parallel({
            count: Model.count.bind(Model, mongoQuery),
            find: Model.find.bind(Model, mongoQuery, fields, opts)
          },
            function (err, results) {
              if (err) { return next(err) }
              req.paging = {}
              var lastPageIndex = Math.ceil(results.count / limit)
              var nextPageIndex = query.page + 1
              var thisPageIndex = query.page
              var prevPageIndex = query.page - 1
              var firstPageIndex = 1
              if (firstPageIndex !== thisPageIndex) {
                req.paging.first = generatePageLink(req, firstPageIndex, 'first')
              }
              if (prevPageIndex >= 1) {
                req.paging.prev = generatePageLink(req, prevPageIndex, 'prev')
              }
              if (nextPageIndex <= lastPageIndex) {
                req.paging.next = generatePageLink(req, nextPageIndex, 'next')
              }
              if (lastPageIndex !== thisPageIndex) {
                req.paging.last = generatePageLink(req, lastPageIndex, 'last')
              }
              self.dbCallback(req, next)(null, results.find)
            })
        }
        function generatePageLink (req, pageIndex, rel) {
          var parsedDomain = url.parse(process.env.FULL_API_DOMAIN)
          var splitUrl = req.originalUrl.split('?')
          var searchString = '?' + (splitUrl.length === 2 ? splitUrl[1] : 'page=1')
          var pageSearch = /[\?|\&]page=[\d]+/.exec(searchString)
          if (!pageSearch) {
            searchString += '&page=' + pageIndex
          } else {
            searchString = searchString.replace(pageSearch[0],
              pageSearch[0].slice(0, 1) + 'page=' + pageIndex)
          }
          var newUrlData = {
            protocol: 'http:',
            slashes: true,
            host: parsedDomain.host,
            pathname: splitUrl[0],
            search: searchString
          }
          var urlString = url.format(newUrlData)
          return urlString + ' rel="' + rel + '"'
        }
      },
      findConflict: function (query) {
        return flow.series(
          self.findOne(query, { _id: 1 }),
          self.checkConflict
        )
      },
      create: function (data) {
        return function (req, res, next) {
          var localData = utils.replacePlaceholders(req, data) || {}
          req[self.key] = new self.Model(localData)
          next()
        }
      },
      respond: function (req, res, next) {
        var pluralKey = self.pluralKey
        var key = self.key
        var val = req[key]
        req[key] = (val && val.toJSON) ? val.toJSON() : val
        if (res.code) {
          res.status(res.code)
        }
        if (req.paging) {
          var refs = Object.keys(req.paging).map(function (key) {
            return req.paging[key]
          })
          res.set('link', refs.join(', '))
        }
        if (req[key]) {
          res.json(req[key])
        } else if (req[pluralKey]) {
          self.respondList(req, res, next)
        } else {
          checkFound(self.key)(req, res, next)
        }
      },
      respondList: function (req, res) {
        var pluralKey = self.pluralKey
        var arr = req[pluralKey].paging
          ? req[pluralKey].data
          : req[pluralKey]
        arr.forEach(function (item, i) {
          arr[i] = (item && item.toJSON) ? item.toJSON() : item
        })
        res.json(res.code || 200, req[pluralKey])
      },
      checkConflict: function (req, res, next) {
        var paramId = req.params && (req.params.id || req.params[self.key + 'Id'])
        var conflictId = req[self.key] && req[self.key]._id
        if (paramId && utils.equalObjectIds(paramId, conflictId)) {
          return next() // ignore the conflict if it is itself
        }
        var keys = getLastQueryKeys()
        // TODO fix this message for $or queries
        var message = keys
          ? [ self.key, 'with', keys, 'already exists' ].join(' ')
          : self.key + ' already exists'
        utils.conflict(self.key, message)(req, res, next)
        function getLastQueryKeys () {
          var lastQuery = req[self.key + 'LastQuery'] || {}
          var keys
          if (utils.isObjectId(lastQuery)) {
            keys = ['_id']
          } else if (isObject(lastQuery)) {
            keys = Object.keys(lastQuery).join(',')
          } else {
            keys = null
          }
          return keys
        }
      }
    }
  }
  return ModelMiddleware
}

/**
 * TODO: description
 * @param {Object} Model - mongoose model
 * @param {String} key
 * @param {Object} extendMethods
 */
module.exports = function createMongooseMiddleware (Model, key, extendMethods) {
  var ModelMiddleware = getModelMiddlewareClass()
  var modelMiddleware = new ModelMiddleware(Model, key)
  var boundExtend = {}
  Object.keys(extendMethods || {}).forEach(function (method) {
    if (typeof extendMethods[method] === 'function') {
      boundExtend[method] = extendMethods[method].bind(modelMiddleware)
    }
  })
  extend(modelMiddleware, boundExtend)
  return modelMiddleware
}
