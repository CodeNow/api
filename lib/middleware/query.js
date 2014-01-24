var RequestData = require('middleware/RequestData');

var Query = function () {};
Query.prototype = new RequestData('query');

module.exports = new Query();
