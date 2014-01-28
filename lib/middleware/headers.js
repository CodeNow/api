var RequestData = require('middleware/RequestData');

var Headers = function () {};
Headers.prototype = new RequestData('headers');

module.exports = new Headers();