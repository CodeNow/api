var RequestData = require('middleware/RequestData');

var Params = function () {};
Params.prototype = new RequestData('params');

module.exports = new Params();
