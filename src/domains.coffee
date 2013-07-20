domain = require 'domain'

module.exports = () ->
  (req, res, next) ->
    d = domain.create()
    d.on 'error', (err) ->
      next err
    d.add req
    d.add res
    d.run next