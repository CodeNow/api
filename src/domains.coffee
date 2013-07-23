configs = require './configs'
domain = require 'domain'

module.exports = (parentDomain) ->
  (req, res, next) ->
    d = domain.create()
    req.domain = d
    d.add req
    d.add res
    d.on 'error', (e) ->
      if parentDomain and configs.throwErrors
        parentDomain.emit 'error', e
      else
        next e
    d.run next