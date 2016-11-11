'use strict'

var express = require('express')
var app = module.exports = express()
var logger = require('middlewares/logger')(__filename)
var keypather = require('keypather')()

app.post('/actions/github',
  function (req, res, next) {
    logger.log.trace({
      repository: keypather.get(req, 'body.repository.full_name'),
      hooksUrl:  keypather.get(req, 'body.repository.hooks_url'),
      pusher: keypather.get(req, 'body.repository.pusher'),
      sender: keypather.get(req, 'body.repository.sender.login')
    }, '/actions/github called. Redirecting request to drake. This endpoint should be modified')
    res.redirect(303, process.env.GITHUB_WEBHOOK_URL)
  }
)
