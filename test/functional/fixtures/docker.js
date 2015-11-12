var app = require('docker-mock')

module.exports.started = false
module.exports.start = function (port, cb) {
  if (typeof port === 'function') {
    cb = port
    port = 4243
  }
  port = port || 4243
  var self = this
  this.server = app.listen(port, function (err) {
    if (err) { throw err }
    self.started = true
    cb(err)
  })
  require('server-destroy')(this.server)
  return this
}
module.exports.stop = function (cb) {
  var self = this
  this.server.destroy(function (err) {
    self.started = false
    cb(err)
  })
  return this
}
