var async = require('async');
var helpers = require('./helpers');

var containers = module.exports = {
  deleteContainers: function (runnables, callback) {
    async.forEach(runnables, containers.deleteContainer, callback)
  },
  deleteContainer: function (runnableId, callback) {
    if (runnableId._id) runnableId = runnableId._id;
    console.log(runnableId)
    var users = require('./userFactory');
    users.createAdmin({}, function (err, user) {
      if (err) return callback(err);
      user.del('/users/me/runnables/' + runnableId)
        .expect(200)
        .end(callback);
    });
  },
}