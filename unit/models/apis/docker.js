'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');
var noop = require('101/noop');

require('loadenv')();
var Docker = require('models/apis/docker');

describe('docker', function () {
  var model = new Docker('http://fake.host.com');

  describe('startUserContainer', function () {
    afterEach(function (done) {
      model.startContainer.restore();
      done();
    });

    it('should not include charon if env variable is not set', function (done) {
      sinon.stub(model, 'startContainer', function (container, opts) {
        expect(opts.Dns.length).to.equal(1);
        done();
      });
      model.startUserContainer({}, '', {}, noop);
    });

    it('should include charon as the first dns when evn is set', function (done) {
      var host = process.env.CHARON_HOST = '10.10.10.10';
      sinon.stub(model, 'startContainer', function (container, opts) {
        expect(opts.Dns.length).to.equal(2);
        expect(opts.Dns[0]).to.equal(host);
        delete process.env.CHARON_HOST;
        done();
      });
      model.startUserContainer({}, '', {}, noop);
    });

    it('should use the charon weave ip for codenow', function(done) {
      var owner = process.env.CODENOW_GITHUB_ID;
      var host = process.env.CODENOW_CHARON_WEAVE_IP = '1.1.1.1';
      sinon.stub(model, 'startContainer', function (container, opts) {
        expect(opts.Dns.length).to.equal(2);
        expect(opts.Dns[0]).to.equal(host);
        delete process.env.CODENOW_CHARON_WEAVE_IP;
        done();
      });
      model.startUserContainer({}, owner, {}, noop);
    });
  }); // end 'startUserContainer'
});
