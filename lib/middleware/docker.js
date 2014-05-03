var createModelMiddleware = require('./createModelMiddleware');
var Docker = require('models/docker');

var docker = module.exports = createModelMiddleware('docker', Docker);
