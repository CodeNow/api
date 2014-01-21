var RequestData = require('./RequestData');

var Query = function () {};
Query.prototype = new RequestData('query');

var query = module.exports = new Query();
