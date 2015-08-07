'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;

var rabbitMQ = require('models/rabbitmq');

describe('RabbitMQ Model', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    ctx.rabbitmq = rabbitMQ;
    done();
  });

  describe('close', function() {
    it('should just callback if the rabbitmq is not started', function(done) {
      ctx.rabbitmq.close(done);
    });
  });

  describe('unloadWorkers', function() {
    it('should just callback if the rabbitmq is not started', function(done) {
      ctx.rabbitmq.unloadWorkers(done);
    });
  });
});
