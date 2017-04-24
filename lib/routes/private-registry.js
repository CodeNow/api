'use strict'

const BigPoppaClient = require('@runnable/big-poppa-client')
const express = require('express')
const joi = require('utils/joi')
const logger = require('logger')

const app = module.exports = express()
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const postSchema = joi.object({
  username: joi.string().required(),
  password: joi.string().required(),
  url: joi.string().required()
}).unknown().required()

app.post('/organization/:bpOrgId/private-registry',
  function (req, res, next) {
    const log = logger.child({
      method: 'post',
      route: '/organization/:bpOrgId/private-registry',
      org: req.params.bpOrgId
    })
    log.trace('called')
    return joi.validateOrBoomAsync(req.body, postSchema)
      .then(() => bigPoppaClient.getOrganization(req.params.bpOrgId))
      .tap(organization => PermissionService.isOwnerOf(req.sessionUser, organization))
      .tap(() => {
        log.trace({
          privateRegistryUrl: req.body.url,
          privateRegistryUsername: req.body.username
        }, 'validated')
        return bigPoppaClient.updateOrganization(req.params.bpOrgId, {
          privateRegistryUrl: req.body.url,
          privateRegistryUsername: req.body.username,
          privateRegistryPassword: req.body.privateRegistryPassword
        })
      })
      .tap(() => {
        log.trace('updated organization')
        res.status(204)
        res.end()
      })
      .catch(next)
  }
)
