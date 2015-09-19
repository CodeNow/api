/**
 * @module unit/models/services/instance-service
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var noop = require('101/noop');
var sinon = require('sinon');
var Code = require('code');
var rabbitMQ = require('models/rabbitmq');
var instanceService = require('models/services/instance-service');
var Instance = require('models/mongo/instance');

var it = lab.it;
var describe = lab.describe;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var expect = Code.expect;

describe('InstanceService', function () {

  describe('#deleteForkedInstancesByRepoAndBranch', function () {

    it('should return error if #findForkedInstances failed', function (done) {
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(new Error('Some error'));
      instanceService.deleteForkedInstancesByRepoAndBranch('user-id', 'api', 'master',
        function (err) {
          expect(err).to.exist();
          expect(err.message).to.equal('Some error');
          Instance.findForkedInstances.restore();
          done();
        });
    });

  });

});
