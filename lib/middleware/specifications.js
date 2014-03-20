var Spec = require('models/specifications');
var createModelMiddleware = require('./createModelMiddleware');

var specifications = module.exports = createModelMiddleware(Spec);