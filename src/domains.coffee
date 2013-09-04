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
      console.error 'DOMAIN', e
      if parentDomain and configs.throwErrors 
        throw e 
      else if e.message and dockerExp.test e.message 
        console.error e.message
        parts = dockerExp.exec e.message
        console.error 'parts', parts
        code = parts[1]
        message = parts[2]
        if code >= 500 then code = 502
        console.error code, message
        res.json code, message: message
      else
        next e
    d.run next