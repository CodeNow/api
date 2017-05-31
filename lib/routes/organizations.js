'use strict'

const express = require('express')
const logger = require('logger')
const OrganizationService = require('models/services/organization-service')
const promiseResponseHandler = require('./promise-response-handler')
const SshKeyService = require('models/services/ssh-key-service')
const keypather = require('keypather')()

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
      parseInt(req.params.bpOrgId, 10),
      req.body
    )
      .tap(() => log.trace('updated organization'))
      .then(() => { return { status: 204 } })
      .asCallback(promiseResponseHandler.responseHandler.bind(promiseResponseHandler, res, next))
  }
)

app.post('/organizations/:bpOrgId/ssh-key',
  function (req, res, next) {
    const log = logger.child({
      method: 'post',
      route: '/organizations/:bpOrgId/ssh-key',
      org: req.params.bpOrgId
    })
    log.trace('called')

    return SshKeyService.saveSshKey(
      parseInt(req.params.bpOrgId, 10),
      req.sessionUser,
      keypather.get(req, 'sessionUser.accounts.github.accessToken')
    )
      .tap(() => log.trace('saved ssh key'))
      .then(() => { return {status: 204} })
      .asCallback(promiseResponseHandler.responseHandler.bind(promiseResponseHandler, res, next))
  }
)

app.get('/organizations/:bpOrgId/ssh-key',
  function (req, res, next) {
    const log = logger.child({
      method: 'get',
      route: '/organizations/:bpOrgId/ssh-key',
      org: req.params.bpOrgId
    })
    log.trace('called')

    return SshKeyService.getSshKeysByOrg(
        parseInt(req.params.bpOrgId, 10),
        keypather.get(req, 'sessionUser.accounts.github.accessToken')
      )
        .tap(() => log.trace('fetched ssh key'))
        .then((keys) => { return {status: 200, json: { keys }} })
        .asCallback(promiseResponseHandler.responseHandler.bind(null, res, next))
  }
)
