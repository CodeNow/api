'use strict'

const express = require('express')
const joi = require('utils/joi')
const logger = require('logger')
const OrganizationService = require('models/services/organization-service')

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
      .tap(() => {
        log.trace('updated organization')
        res.status(204)
        res.end()
      })
      .catch(next)
  }
)
