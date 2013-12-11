configs = require '../configs'

Harbourmaster = (url) ->
  this.url = url

Harbourmaster.prototype.commitContainer = (domain, encodedContainer, token, cb) ->
  container = encodedContainer
  request
    pool: false
    url: "#{@url}/containers/#{container.servicesToken}/commit"
    method: 'POST'
    json: container
    headers:
      'runnable-token': token
  , domain.intercept (res) ->
    if (res.statusCode isnt 204)
      cb error 502, "Error committing: #{JSON.stringify(res.body)}"
    else
      cb()

module.exports = new Harbourmaster(configs.harbourmaster)