var Spec = require('models/specifications');
var createMongooseMiddleware = require('./createMongooseMiddleware');

var specifications = module.exports = createMongooseMiddleware(Spec);