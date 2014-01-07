var async = require('async');
var helpers = require('./helpers');
var users = require('./userFactory');

function createChannel (name, cb) {
  async.waterfall([
    function (cb) {
      users.createAdmin({
        'username': helpers.randomValue(),
        'email': helpers.randomValue() + '@fake.com'
      }, cb);
    },
    function (admin, cb) {
      admin.post('/channels')
        .send({ name: name })
        .end(function (err, channel) {
          cb(err, channel.res.body);
        });
    }
  ], cb);
}

function createChannels (names, cb) {
  async.each(names, createChannel, cb);
}

module.exports = {
  createChannel: function (name) {
    return function (callback) {
      createChannel(name, callback);
    };
  },
  createChannels: function () {
    var names = Array.prototype.slice.call(arguments);
    return function (callback) {
      createChannels(names, callback);
    };
  }
};