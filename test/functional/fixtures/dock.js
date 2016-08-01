
var async = require('async')
var createCount = require('callback-count')
var redis = require('models/redis')
var dockerModuleMock = require('./mocks/docker-model')

process.env.AUTO_RECONNECT = false // needed for test
process.env.HOST_TAGS = 'default' // needed for test

var put = require('101/put')

var Hermes = require('runnable-hermes')

// Sauron mock listens for `container.life-cycle.started` event and
// publishes `container.network.attached`
var sauronMock = {
  start: function (cb) {
    var publishedEvents = [
      'container.network.attached'
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
  started = true
  var count = createCount(2, done)
  dockerModuleMock.setup(count.next)
  sauronMock.start(count.next)
}
function stopDock (done) {
  if (!started) { return done() }
  started = false
  var count = createCount(3, done)
  sauronMock.stop(count.next)
  redis.del(process.env.REDIS_HOST_KEYS, count.next)
  dockerModuleMock.clean(count.next)
}
