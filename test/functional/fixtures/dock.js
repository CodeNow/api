var async = require('async')
var dockerModel = require('models/apis/docker')
var createCount = require('callback-count')
var docker = require('./docker')
var redis = require('models/redis')
var dockerModuleMock = require('./mocks/docker-model')
var sinon = require('sinon')

process.env.AUTO_RECONNECT = false // needed for test
process.env.HOST_TAGS = 'default' // needed for test
var dockerListener = require('docker-listener')

var put = require('101/put')

var Hermes = require('runnable-hermes')

// Sauron mock listens for `container.life-cycle.started` event and
// publsihes `container.network.attached`
var sauronMock = {
  start: function (cb) {
    var publishedEvents = [
      'container.network.attached',
      'container.network.attach-failed'
    ]

    var subscribedEvents = [
      'container.life-cycle.started'
    ]

    var opts = {
      hostname: process.env.RABBITMQ_HOSTNAME,
      password: process.env.RABBITMQ_PASSWORD,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      name: '10.12.13.11.sauron'
    }
    var rabbitPublisher = new Hermes(put({
      publishedEvents: publishedEvents
    }, opts))
      .on('error', function (err) {
        console.log('rabbit publisher error', err)
      })
    this.rabbitPublisher = rabbitPublisher

    var rabbitSubscriber = new Hermes(put({
      subscribedEvents: subscribedEvents
    }, opts))
      .on('error', function (err) {
        console.log('rabbit subscriber error', err)
      })
    this.rabbitSubscriber = rabbitSubscriber

    async.series([
      rabbitPublisher.connect.bind(rabbitPublisher),
      rabbitSubscriber.connect.bind(rabbitSubscriber),
      function (stepCb) {
        rabbitSubscriber.subscribe('container.life-cycle.started', function (data, jobCb) {
          data.containerIp = '10.12.10.121'
          rabbitPublisher.publish('container.network.attached', data)
          jobCb()
        })
        stepCb()
      }
    ], cb)
  },
  stop: function (cb) {
    async.series([
      this.rabbitSubscriber.unsubscribe.bind(this.rabbitSubscriber, 'container.life-cycle.started', null),
      this.rabbitSubscriber.close.bind(this.rabbitSubscriber),
      this.rabbitPublisher.close.bind(this.rabbitPublisher)
    ], cb)
  }
}

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
  var count = createCount(3, done)
  dockerModuleMock.setup(count.next)
  sauronMock.start(count.next)

  ctx.docker = docker.start(function (err) {
    if (err) { return count.next(err) }
    dockerListener.start(process.env.DOCKER_LISTENER_PORT, function (err) {
      if (err) { return count.next(err) }
      count.next()
    })
  })
}
function stopDock (done) {
  if (!started) { return done() }
  dockerModel.prototype.pullImage.restore()
  started = false
  var count = createCount(3, done)
  sauronMock.stop(count.next)
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next)
  dockerModuleMock.clean(count.next)
  dockerListener.stop(function (err) {
    if (err) { return count.next(err) }
    docker.stop(count.next)
  })
}
