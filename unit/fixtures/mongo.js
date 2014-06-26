var mongoose = require('mongoose');

module.exports = {
  connect: function (cb) {
    if (mongoose.connection.readyState === 1) {
      cb();
    } else {
      mongoose.connect(require('configs').mongo, cb);
    }
  }
};
