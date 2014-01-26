var User = require('models/users');
var createModelMiddleware = require('./createModelMiddleware');
var utils = require('./utils');
var series = utils.series;
var reqUnless = utils.reqUnless;

var me = module.exports = createModelMiddleware(User, {
  findMe: function (req, res, next) {
    if (!req.user_id) {
      throw new Error('NO USER_ID');
    }
    series(
      this.findById('user_id'),
      this.checkFound
    )(req, res, next);
  },
  isUser: function (req, res, next) {
    if (req.user_id !== req.params.userId) {
      return next(error(403, 'access denied'));
    }
    next();
  },
  isOwnerOf: function (key) {
    return function (req, res, next) {
      var model = req[key];
      if (!model || !utils.equalObjectIds(model.owner, req.user_id)){
        return next(error(403, 'access denied'));
      }
    };
  },
  isVerified: function (req, res, next) {
    this.is('verified')(req, res, next);
  },
  isModerator: function (req, res, next) {
    this.is('moderator')(req, res, next);
  },
  is: function (role) {
    var capital = utils.capitalize(role);
    return series(
      utils.log('hello'),
      reqUnless('me',
        this.findMe),
      utils.log('foundme?', 'me'),
      this.model.unless('is'+capital,
        utils.message(403, 'access denied')));
  },
  respond: function (req, res, next) {
    console.log('RESPOND');
    series(
      addAccessToken,
      this.super.respond
    )(req, res, next);
    function addAccessToken (req, res, next) {
      if (req.me && req.access_token) {
        if (req.me.toJSON) {
          req.me = req.me.toJSON();
        }
        req.me.access_token = req.access_token;
      }
      next();
    }
  }
}, 'me');