'use strict'

const express = require('express')
const joi = require('utils/joi')
const logger = require('logger')
const OrganizationService = require('models/services/organization-service')
const promiseResponseHandler = require('./promise-response-handler')

const app = module.exports = express()

app.post('/organizations/:bpOrgId/private-registry',
  function (req, res, next) {
    const log = logger.child({
      method: 'post',
      route: '/organizations/:bpOrgId/private-registry',
      org: req.params.bpOrgId
    })
    log.trace('called')
    return OrganizationService.updatePrivateRegistryOnOrgBySessionUser(
      req.sessionUser,
      req.params.bpOrgId,
      req.body
    )
      .tap(() => log.trace('updated organization'))
      .then(() => { return { status: 204 } })
      .asCallback(promiseResponseHandler.responseHandler.bind(promiseResponseHandler, res, next))
  }
)
