'use strict';

require('loadenv')();
var Boom = require('dat-middleware').Boom;
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');

var Boom = require('dat-middleware').Boom;
var DeleteInstanceContainer = require('workers/delete-instance-container');
// var Docker = require('models/apis/docker');
// var Hosts = require('models/redis/hosts');
var Sauron = require('models/apis/sauron');

describe('Worker: delete-instance-container', function () {

  describe('#handle', function () {
    it('should fail job if sauron call failed', function (done) {
      var worker = new DeleteInstanceContainer({
        instance: {
          container: {
            dockerHost: 'https://localhost:4242'
          }
        }
      });
      sinon.stub(Sauron.prototype, 'detachHostFromContainer', function (networkIp, hostIp, container, cb) {
        cb(Boom.badRequest('Sauron error'));
      });
      worker.handle(function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Sauron error');
        Sauron.prototype.detachHostFromContainer.restore();
        done();
      });
    });
  });
});
