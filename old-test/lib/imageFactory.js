var async = require('async');

var images = module.exports = {
  deleteImages: function (runnables, callback) {
    async.forEach(runnables, images.deleteImage, callback);
  },
  deleteImage: function (runnableId, callback) {
    if (runnableId._id) {
      runnableId = runnableId._id;
    }
    var users = require('./userFactory');
    users.createAdmin({}, function (err, user) {
      if (err) {
        return callback(err);
      }
      user.del('/runnables/' + runnableId)
        .expect(200)
        .end(callback);
    });
  },
  createImageFromFixture: function (name, imageName, callback) {
    var users = require('./userFactory');
    users.createAdmin(function (err, user) {
      if (err) {
        return callback(err);
      }
      user.createImageFromFixture(name, imageName, callback);
    });
  }
};