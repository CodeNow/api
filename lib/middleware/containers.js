var utils = require('middleware/utils');
var Container = require('models/containers');
var async = require('async');
var _ = require('lodash');
var error = require('error');
var users = require('middleware/users');
var tokens = require('middleware/tokens');

var createModelMiddleware = require('./createModelMiddleware');

var containers = module.exports = createModelMiddleware(Container, {
  authChangeUpdateOwners: function (req, res, next) {
    this.update({
      owner: 'user_id'
    }, {
      $set: {
        owner: 'me._id'
      }
    })(req, res, next);
  }
});