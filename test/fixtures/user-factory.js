var isFunction = require('101/is-function');
var Runnable = require('runnable');
var host = require('./host');
var uuid = require('uuid');
var Faker = require('faker');
var User = require('models/mongo/user');

module.exports = {
  createTokenless: function () {
    if (arguments.length) {
      throw new TypeError('createTokenless is sync (no cb)');
    }
    return new Runnable(host);
  },
  // createAnonymous: function (cb) {
  //   var user = this.createTokenless();
  //   user.anonymous(cb);
  //   return user;
  // },
  createGithub: function (cb) {
    var user = this.createTokenless();
    return user.githubLogin(cb);
  },
  createModerator: function (cb) {
    var user = this.createGithub(function (err, body) {
      if (err) {
        cb(err);
      }
      else {
        var $set = {
          permission_level: 5
        };
        User.updateById(body._id, { $set: $set }, callbackData(body, cb));
      }
    });
    return user;
  }
};

function callbackData (data, cb) {
  return function (err) {
    if (err) {
      cb(err);
    }
    else {
      cb(null, data);
    }
  };
}
