var isFunction = require('101/is-function');
var findIndex = require('101/find-index');

module.exports = function (userId, username, email, cb) {
  var args = Array.prototype.slice.call(arguments);
  var index = findIndex(args, isFunction);
  args = args.slice(index+1);
  userId   = args[0];
  username = args[1];
  email    = args[2];
  cb       = args[3];

  require('./user')(userId, username);
  require('./user-emails')(email);
  require('./user-emails')(email);

  if (cb) {
    cb(null, userId, username);
  }
  else {
    return userId;
  }
};