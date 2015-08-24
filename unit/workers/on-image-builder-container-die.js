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
var ContextVersion = require('models/mongo/context-version');
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
    ctx.data = {
      from: '34565762',
      host: '5476',
      id: '3225',
      time: '234234',
      uuid: '12343'
    };
    ctx.mockContextVersion = {
      toJSON: noop
    };
    sinon.stub(async, 'series', noop);
    ctx.worker = new OnImageBuilderContainerDie(ctx.data);
    ctx.worker.handle();
    done();
  });

  afterEach(function (done) {
    async.series.restore();
    done();
  });

  describe('_findContextVersion', function () {
    describe('not found', function () {
      beforeEach(function (done) {
        sinon.stub(ContextVersion, 'findOneBy', function (keypath, data, cb) {
          expect(keypath).to.equal('build.dockerContainer');
          expect(data).to.equal(ctx.data.id);
          cb(null, null);
        });
        done();
      });
      afterEach(function (done) {
        ContextVersion.findOneBy.restore();
        done();
      });
      it('should call back with error if context-version not found', function (done) {
        ctx.worker._findContextVersion(function (err) {
          expect(err.message).to.equal('_findContextVersion: context version not found');
          done();
        });
      });
    });

    describe('mongoose error', function () {
      beforeEach(function (done) {
        sinon.stub(ContextVersion, 'findOneBy', function (keypath, data, cb) {
          expect(keypath).to.equal('build.dockerContainer');
          expect(data).to.equal(ctx.data.id);
          cb(new Error('mongoose error'), null);
        });
        done();
      });
      afterEach(function (done) {
        ContextVersion.findOneBy.restore();
        done();
      });
      it('should call back with error if context-version not found', function (done) {
        ctx.worker._findContextVersion(function (err) {
          expect(err.message).to.equal('mongoose error');
          done();
        });
      });
    });

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ContextVersion, 'findOneBy', function (keypath, data, cb) {
          expect(keypath).to.equal('build.dockerContainer');
          expect(data).to.equal(ctx.data.id);
          cb(null, ctx.mockContextVersion);
        });
        done();
      });
      afterEach(function (done) {
        ContextVersion.findOneBy.restore();
        done();
      });
      it('should call back with error if context-version not found', function (done) {
        ctx.worker._findContextVersion(function (err) {
          expect(err).to.be.undefined();
          expect(ctx.worker.contextVersion).to.equal(ctx.mockContextVersion);
          done();
        });
      });
    });
  });
});
