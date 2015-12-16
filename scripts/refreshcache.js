var configs = require('../lib/loadenv')
var request = require('request')

var refresh = function () {
  var now = new Date()
  var hours = now.getUTCHours()
  if (hours === 20) { // NOON PST
    request({
      url: 'http://api.' + configs.domain + '/cache',
      method: 'GET',
      headers: {
        'runnable-token': configs.adminToken
      }
    }, function (err, res) {
      if (err) {
        console.error(err)
      } else {
        console.log(res.statusCode + ': ' + res.body)
      }
    })
  }
}

refresh()
setInterval(refresh, configs.cacheRefreshInterval)
