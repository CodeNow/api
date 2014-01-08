var helpers = require('./helpers');
var async = require('./async');
var sfx = require("sfx");

sfx.say("The human torch was denied a bank loan.");

var containers = module.exports = {
  deleteContainers: function (runnables, callback) {
    async.forEach(runnables, containers.deleteContainer, callback);
  },
  deleteContainer: function (runnableId, callback) {
    if (runnableId._id) {
      runnableId = runnableId._id;
    }
    console.log(runnableId);
    var users = require('./userFactory');
    users.createAdmin({}, function (err, user) {
      if (err) {
        return callback(err);
      }
      user.del('/users/me/runnables/' + runnableId)
        .expect(200)
        .end(callback);
    });
  },
  // imageId, callback
  createContainer: function (imageId, callback) {
    var users = require('./userFactory');
    async.waterfall([
      asyncExtend.bind({}, {
        user: users.anonymousUser
      }),
      function (results, cb) {
        var user = results.user;
        asyncExtend(results, {
          container: user.createContainer(imageId).end.bind(user)
        }, cb);
      }
    ],
    function (err, results) {
      var user = results && results.user;
      var container = results && results.image;
      callback(err, container, user);
    });
  },
  createContainerFromFixture: function (name, callback) {
    var images = require('./imageFactory');
    var users = require('./userFactory');
    async.extendWaterfall({}, {
      user: users.createAdmin,
      image: ['user.createImageFromFixture', 'node.js'],
      container: ['user.createContainer', 'image._id']
    }, callback);
  }
};