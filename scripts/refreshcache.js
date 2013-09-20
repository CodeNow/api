var configs = require('../lib/configs');
var request = require('request');

var refresh = function() {
  request({
    url: 'http://api.' + configs.domain + '/cache',
    method: 'GET',
    headers: {
      'runnable-token': configs.adminToken
    }
  }, function (err, res) {
    if (err) {
      console.error(err);
    } else {
      console.log(res.statusCode + ': ' + res.body);
    }
  });
}

refresh();
setInterval(refresh, configs.cacheRefreshInterval);
