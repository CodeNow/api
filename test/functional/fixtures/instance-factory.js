var isFunction = require('101/is-function')

module.exports = {
  createInstanceBy: function (user, body, cb) {
    if (isFunction(body)) {
      cb = body
      body = null
    }
    body = body || {}
    var instance = user.createInstance({ json: body }, cb)
    return instance
  }
}
