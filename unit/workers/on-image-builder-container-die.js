/**
 * @module unit/workers/on-image-builder-container-die
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var async = require('async');
var noop = require('101/noop');
var sinon = require('sinon');

var Instance = require('models/mongo/instance');
var rabbitMQ = require('models/rabbitmq');

var OnImageBuilderContainerDie = require('workers/on-image-builder-container-die');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('OnImageBuilderContainerDie', function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    done();
  });

  afterEach(function (done) {
    done();
  });

  describe('_validateDieData', function () {
  });

  describe('_findContextVersion', function () {
  });
});
