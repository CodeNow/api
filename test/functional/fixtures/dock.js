var dockerModel = require('models/apis/docker');
var createCount = require('callback-count');
var docker = require('./docker');
var redis = require('models/redis');
var mavisApp = require('mavis');
var dockerModuleMock = require('./mocks/docker-model');
var sinon = require('sinon');

process.env.AUTO_RECONNECT = false; // needed for test
process.env.HOST_TAGS='default'; // needed for test
var dockerListener = require('docker-listener');

var url = require('url');
var put = require('101/put');

var Hermes = require('runnable-hermes');


// Sauron mock listens for `container.life-cycle.started` event and
// publsihes `container.network.attached`
var sauronMock = {
  start: function (cb) {
    var publishedEvents = [
      'container.network.attached',
      'container.network.attach-failed'
    ];

    var subscribedEvents = [
      'container.life-cycle.died',
      'container.life-cycle.started'
    ];

    var opts = {
      hostname: process.env.RABBITMQ_HOSTNAME,
      password: process.env.RABBITMQ_PASSWORD,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      name: '10.12.13.11.sauron'
    };
    var rabbitPublisher = new Hermes(put({
      publishedEvents: publishedEvents,
    }, opts))
    .on('error', function (err) {
      console.log('rabbit publisher error', err);
    });
    this.rabbitPublisher = rabbitPublisher;

    var rabbitSubscriber = new Hermes(put({
      subscribedEvents: subscribedEvents,
    }, opts))
    .on('error', function (err) {
      console.log('rabbit subscriber error', err);
    });
    this.rabbitSubscriber = rabbitSubscriber;

    var count = createCount(2, cb);
    rabbitPublisher.connect(count.next);
    rabbitSubscriber.connect(function (err) {
      if (err) {
        return count.next(err);
      }
      rabbitSubscriber.subscribe('container.life-cycle.started', function (data, jobCb) {
        data.containerIp = '10.12.10.121';
        rabbitPublisher.publish('container.network.attached', data);
        jobCb();
      });
      count.next();
    });
  },
  stop: function (cb) {
    var count = createCount(3, cb);
    this.rabbitSubscriber.unsubscribe('container.life-cycle.started', null, function(err) {
      if (err) {
        console.log('dock sauronMock unsubscribe error', err);
      }
      count.next();
    });
    this.rabbitSubscriber.close(function (err) {
      if (err) {
        console.log('dock sauronMock subscriber close error', err);
      }
      count.next();
    });
    this.rabbitPublisher.close(function (err) {
      if (err) {
        console.log('dock sauronMock publisher close error', err);
      }
      count.next();
    });
  }
};

module.exports = {
  start: startDock,
  stop: stopDock
};
var ctx = {};
var started = false;

function startDock (done) {
  if(started) { return done(); }
  // FIXME: hack because docker-mock does not add image to its store for image-builder creates
  sinon.stub(dockerModel.prototype, 'pullImage').yieldsAsync();
  started = true;
  var count = createCount(3, done);
  dockerModuleMock.setup(count.next);
  sauronMock.start(count.next);
  ctx.docker = docker.start(function (err) {
    if (err) { return count.next(err); }
    ctx.mavis = mavisApp.listen(url.parse(process.env.MAVIS_HOST).port);
    ctx.mavis.on('listening', function (err) {
      if (err) { return count.next(err); }
      dockerListener.start(process.env.DOCKER_LISTENER_PORT, function(err) {
        if (err) { return count.next(err); }
        count.next();
      });
    });
  });
}
function stopDock (done) {
  if(!started) { return done(); }
  dockerModel.prototype.pullImage.restore();
  started = false;
  var count = createCount(4, done);
  ctx.mavis.close(count.next);
  sauronMock.stop(count.next);
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next);
  dockerModuleMock.clean(count.next);
  dockerListener.stop(function(err) {
    if (err) { return count.next(err); }
    docker.stop(count.next);
  });
}
