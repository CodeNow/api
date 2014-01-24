var RequestData = require('middleware/RequestData');

var Body = function () {};
Body.prototype = new RequestData('body');

module.exports = new Body();