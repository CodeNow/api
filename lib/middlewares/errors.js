'use strict'

const Boom = require('dat-middleware').Boom
const errorMessages = require('errors/frontend-error-messages')

const BaseSchema = require('models/mongo/schemas/base')
const ContextVersion = require('models/mongo/context-version')
const Instance = require('models/mongo/instance')
const Promise = require('bluebird')
const User = require('models/mongo/user')

const errorMiddleware = module.exports

errorMiddleware.convertInternalErrorsToBoom = function (err, req, res, next) {
  return Promise.reject(err)
    .catch(User.NotFoundError, function () {
      throw Boom.notFound(errorMessages.user.notFound)
    })
    .catch(ContextVersion.UnbuiltError, function () {
      throw Boom.badRequest(errorMessages.instances.create.unbuiltCv)
    })
    .catch(Instance.CreateFailedError, function () {
      throw Boom.badImplementation(errorMessages.instances.create.failed)
    })
    // these bases need to be at the bottom, since the errors above are derived from these
    .catch(BaseSchema.NotFoundError, function (err) {
      throw Boom.notFound(err.message)
    })
    .catch(BaseSchema.CreateFailedError, function (err) {
      throw Boom.badImplementation(err.message)
    })
    .catch(BaseSchema.IncorrectStateError, function (err) {
      throw Boom.badRequest(err.message)
    })
    .asCallback(function (err) {
      next(err)
    })
}
