var createModelMiddleware = require('middleware/createModelMiddleware');
var HipacheHosts = require('models/redis/HipacheHosts');

module.exports = createModelMiddleware('hipacheHosts', HipacheHosts);