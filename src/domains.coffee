configs = require './configs'
domain = require 'domain'

dockerExp = /^HTTP response code is (\d\d\d) which indicates an error: (.+)$/

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
      if parentDomain and configs.throwErrors
        console.log e.stack
        throw e
      else if e.message and dockerExp.test e.message
        parts = dockerExp.exec e.message
        code = parts[1]
        message = parts[2]
        if code >= 500 then code = 502
        res.json code, message: message
      else
        next e
    d.run next