var _ = require('lodash');
var Spec = require('../models/specifications');
var utils = require('./utils');
var query = require('./query');
var body = require('./body');
var series = utils.series;
var createModelMiddleware = require('./createModelMiddleware');

module.exports = createModelMiddleware(Spec);