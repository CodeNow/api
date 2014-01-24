var async = require('async');
var configs = require('../configs');
var Impl = require('../models/implementations');
var User = require('../models/users');
var Image = require('../models/images');
var _ = require('lodash');
var query = require('./query');
var bcrypt = require('bcrypt');
var error = require('../error');
var utils = require('./utils');
var series = utils.series;
var createModelMiddleware = require('./createModelMiddleware');

module.exports =  createModelMiddleware(Impl, {
  checkNoConflict: function (req, res, next) {
    series(
      query.set('implements', 'req.body.implements'),
      query.set('owner', 'req.user_id'),
      this.findOne,
      this.checkConflict
    )(req, res, next);
  }
});