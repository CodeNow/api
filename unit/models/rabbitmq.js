'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var Code = require('code');
var RabbitMQ = require('models/rabbitmq');

describe('RabbitMQ Model', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    ctx.rabbitmq = new RabbitMQ();
    done();
  });

  describe('stop', function() {
    it('should just callback if the rabbitmq is not started', function(done) {
      ctx.rabbitmq.stop(done);
    });
  });

  describe('unloadWorkers', function() {
    it('should just callback if the rabbitmq is not started', function(done) {
      ctx.rabbitmq.unloadWorkers(done);
    });
  });
});