var dockerModel = require('models/apis/docker')
var createCount = require('callback-count')
var docker = require('./docker')
var redis = require('models/redis')
var mavisApp = require('mavis')
var dockerModuleMock = require('./mocks/docker-model')
var sinon = require('sinon')

process.env.AUTO_RECONNECT = false // needed for test
process.env.HOST_TAGS = 'default' // needed for test
var dockerListener = require('docker-listener')

var url = require('url')
module.exports = {
  start: startDock,
  stop: stopDock
}
var ctx = {}
var started = false

function startDock (done) {
  if (started) { return done() }
  // FIXME: hack because docker-mock does not add image to its store for image-builder creates
  sinon.stub(dockerModel.prototype, 'pullImage').yieldsAsync()
  started = true
  var count = createCount(2, done)
  dockerModuleMock.setup(count.next)
  ctx.docker = docker.start(function (err) {
    if (err) { return count.next(err) }
    ctx.mavis = mavisApp.listen(url.parse(process.env.MAVIS_HOST).port)
    ctx.mavis.on('listening', function (err) {
      if (err) { return count.next(err) }
      dockerListener.start(process.env.DOCKER_LISTENER_PORT, function (err) {
        if (err) { return count.next(err) }
        count.next()
      })
    })
  })
}
function stopDock (done) {
  if (!started) { return done() }
  dockerModel.prototype.pullImage.restore()
  started = false
  var count = createCount(3, done)
  ctx.mavis.close(count.next)
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next)
  dockerModuleMock.clean(count.next)
  dockerListener.stop(function (err) {
    if (err) { return count.next(err) }
    docker.stop(count.next)
  })
}
