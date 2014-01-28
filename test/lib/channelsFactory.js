var async = require('./async');
var helpers = require('./helpers');
var users = require('./userFactory');

function createChannel (name, cb) {
  async.extendWaterfall({}, {
    admin: users.createAdmin,
    channel: ['admin.createChannel', [name]]
  }, cb);
}

function createChannels (names, cb) {
  async.map(names, createChannel, cb);
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