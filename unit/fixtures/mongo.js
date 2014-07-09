var mongoose = require('mongoose');
var configs = require('configs');
configs();
module.exports = {
  connect: function (cb) {
    if (mongoose.connection.readyState === 1) {
      cb();
    } else {
      mongoose.connect(process.env.MONGO, cb);
    }
  }
};
