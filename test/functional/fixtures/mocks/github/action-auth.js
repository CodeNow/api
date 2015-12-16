var isFunction = require('101/is-function')
var findIndex = require('101/find-index')

module.exports = function (token, userId, username, email, cb) {
  var args = Array.prototype.slice.call(arguments)
  var index = findIndex(args, isFunction)
  args = args.slice(index + 1)
  token = args[0]
  userId = args[1]
  username = args[2]
  email = args[3]
  cb = args[4]

  require('./user')(userId, username, token)
  require('./user-emails')(email)
  require('./user-emails')(email)

  if (cb) {
    cb(null, userId, username)
  } else {
    return userId
  }
}
