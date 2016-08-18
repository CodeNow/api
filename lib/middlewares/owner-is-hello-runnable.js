/**
 * @module lib/middlewares/owner-is-hello-runnable
 */
'use strict'

var PermissionService = require('models/services/permission-service')
var utils = require('middlewares/utils')

/**
 * middleware which checks if the session user or a key on req is hello runnable
 */
module.exports = function (modelKey) {
  return function (req, res, next) {
    var model = utils.replacePlaceholders(req, modelKey)
    PermissionService.isHelloRunnableOwnerOf(req.sessionUser, model)
      .asCallback(next)
  }
}
