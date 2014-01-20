var RequestData = require('./RequestData');

var Body = function () {};
Body.prototype = new RequestData('body');

var body = module.exports = new Body();
