var configs = require('../lib/configs');
var request = require('request');

var clean = function(firstRun) {
  request({
    url: 'http://api.' + configs.domain + '/cleanup' + (firstRun ? '?firstRun=true' : ''),
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
};

clean(true);
setInterval(clean, configs.cleanInterval);
