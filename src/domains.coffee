configs = require './configs'
domain = require 'domain'

module.exports = (parent) ->
  (req, res, next) ->
    d = domain.create()
    req.domain = d
    d.add req
    d.add res
    d.on 'error', (e) ->
      if parent and configs.throwErrors
        parent.emit 'error', e
      else
        next e
    d.run next