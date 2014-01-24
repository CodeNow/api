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
  create: function (/* args */) {
    return series(
      this.super.create.apply(this, arguments)
    );
  }
});