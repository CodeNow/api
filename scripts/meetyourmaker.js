var configs = require('../lib/loadenv')
var request = require('request')
var async = require('async')

var clean = function (firstRun) {
  var loginOpts = {
    url: 'http://api.' + configs.domain + '/token',
    method: 'POST',
    json: configs.adminAuth
  }
  var cleanupOpts = {
    url: 'http://api.' + configs.domain + '/cleanup' + (firstRun ? '?firstRun=true' : ''),
    method: 'GET',
    headers: {}
  }
  async.waterfall([
    request.bind(request, loginOpts),
    function (res, body, cb) {
      cleanupOpts.headers['runnable-token'] = body.access_token
      request(cleanupOpts, cb)
    }
  ],
    function (err, res) {
      if (err) {
        console.error(err)
      } else {
        console.log(res.statusCode + ': ' + res.body)
      }
    })
}

clean(true)
setInterval(clean, configs.cleanInterval)
