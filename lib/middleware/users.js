var async = require('async');
var configs = require('configs');
var User = require('models/users');
var _ = require('lodash');
var bcrypt = require('bcrypt');
var error = require('error');
var containers = require('middleware/containers');
var utils = require('middleware/utils');
var body = require('middleware/body');
var series = utils.series;
var ternary = utils.ternary;
var createModelMiddleware = require('./createModelMiddleware');

var users = module.exports = createModelMiddleware(User);