/**
 * @module unit/workers/on-instance-container-die
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var sinon = require('sinon');

var Instance = require('models/mongo/instance');

var OnInstanceContainerDieWorker = require('workers/on-instance-container-die');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;

describe('OnInstanceContainerDieWorker', function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};

    ctx.mockInstance = {
      modifyContainerInspect: sinon.stub().callsArg(2)
    };
    sinon.stub(Instance, "findOneByContainerId").callsArgWith(1, null, ctx.mockInstance);

    ctx.data = {
      id: 111,
      host: '10.0.0.1',
      inspectData: {
        NetworkSettings: {
          Ports: []
        },
        Config: {
          Labels: {
            instanceId: 111,
            ownerUsername: 'fifo',
            sessionUserGithubId: 444,
            contextVersionId: 123
          }
        }
      }
    };
    ctx.worker = new OnInstanceContainerDieWorker();
    ctx.workerResponse = sinon.spy();
    ctx.worker.handle(ctx.data, ctx.workerResponse);
    done();
  });

  afterEach(function (done) {
    Instance.findOneByContainerId.restore();
    done();
  });

  describe('handle', function () {
    it('should update the instance with the inspect results', function (done) {
      sinon.assert.calledOnce(Instance.findOneByContainerId);
      sinon.assert.calledWith(Instance.findOneByContainerId, ctx.data.id);
      sinon.assert.calledOnce(ctx.mockInstance.modifyContainerInspect);
      sinon.assert.calledWith(ctx.mockInstance.modifyContainerInspect, ctx.data.inspectData);
      sinon.assert.calledOnce(ctx.workerResponse);
      sinon.assert.calledWith(ctx.workerResponse, null);
      done();
    });
  });
});
