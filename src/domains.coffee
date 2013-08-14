configs = require './configs'
domain = require 'domain'

module.exports = (parentDomain) ->
  (req, res, next) ->
    d = domain.create()
    req.domain = d
    d.add req
    d.add res
    d.on 'error', (e) ->
      try
        if parentDomain and configs.throwErrors
          parentDomain.emit 'error', e
        else
          next e
      catch e
        console.log e
    d.run next