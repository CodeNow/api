/**
 * @module unit/workers/base-worker
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var noop = require('101/noop');

var BaseWorker = require('workers/base-worker');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('BaseWorker', function () {
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
    ctx.worker = new BaseWorker(ctx.data);
    done();
  });

  afterEach(function (done) {
    done();
  });

  describe('_validateDieData', function () {
    beforeEach(function (done) {
      done();
    });
    afterEach(function (done) {
      done();
    });
    it('should call back with error if event '+
       'data does not contain required keys', function (done) {
      delete ctx.worker.data.uuid;
      ctx.worker._validateDieData(function (err) {
        expect(err.message).to.equal('_validateDieData: die event data missing key: uuid');
        done();
      });
    });

    it('should call back without error if '+
       'event data contains all required keys', function (done) {
      ctx.worker._validateDieData(function (err) {
        expect(err).to.be.undefined();
        done();
      });
    });
  });
});
