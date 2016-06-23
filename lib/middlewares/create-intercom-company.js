'use strict'

var orion = require('@runnable/orion')

module.exports = function (req, res, next) {
  orion.users.create({
    user_id: 'ghost-' + req.body.name,
    update_last_request_at: true,
    companies: [{
      company_id: req.body.name.toLowerCase(),
      name: req.body.name,
      remote_created_at: Math.floor(new Date().getTime() / 1000)
    }]
  })
    .asCallback(next)
}
