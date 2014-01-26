var async = require('async');
var _ = require('lodash');
var error = require('error');
var Category = require('models/categories');

var createModelMiddleware = require('./createModelMiddleware');
var categories = module.exports = createModelMiddleware(Category);