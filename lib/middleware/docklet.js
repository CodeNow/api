var configs = require('configs');
var keypather = require('keypather')();
var _ = require('lodash');
var createModelMiddleware = require('middleware/createModelMiddleware');

var docklet = require('models/docklet');

module.exports = createModelMiddleware('docklet', docklet);