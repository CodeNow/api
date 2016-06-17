/**
 * @module lib/middlewares/owner-is-hello-runnable
 */
'use strict'

var PermisionService = require('models/services/permission-service')
var User = require('models/mongo/user')
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware')
var utils = require('middlewares/utils')

/**
 * middleware which checks if the session user or a key on req is hello runnable
 */
module.exports = createMongooseMiddleware(User, 'sessionUser', {
  isHelloRunnable: function (modelKey) {
    return function (req, res, next) {
      var model = utils.replacePlaceholders(req, modelKey)
      PermisionService.isHelloRunnableOwnerOf(req.sessionUser, model).asCallback(next)
    }
  }
}).isHelloRunnable
