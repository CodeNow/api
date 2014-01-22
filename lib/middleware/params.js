var RequestData = require('middleware/RequestData');

var Params = function () {};
Params.prototype = new RequestData('params');

var params = module.exports = new Params();
