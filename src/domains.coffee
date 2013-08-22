configs = require './configs'
domain = require 'domain'

module.exports = (parentDomain) ->
  (req, res, next) ->
    d = domain.create()
    req.domain = d
    if parentDomain
      parentDomain.add d
      req.parentDomain = parentDomain
    d.add req
    d.add res
    d.on 'error', (e) ->
      if parentDomain and configs.throwErrors then throw e else
        next e
    d.run next