'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;

var sinon = require('sinon');

var Pod = require('models/mongo/pod');
// need to require this to register the model
var Instance = require('models/mongo/instance');

describe('Pods', function () {
  // before(require('./fixtures/mongo').connect);

  it('should know it defaults to not a master', function (done) {
    var p = new Pod();
    p.isMaster(function (err, master) {
      expect(err).to.equal(null);
      expect(master).to.equal(false);
      done();
    });
  });

  it('should be able to be master', function (done) {
    var p = new Pod({ master: true });
    p.isMaster(function (err, master) {
      expect(err).to.equal(null);
      expect(master).to.equal(true);
      done();
    });
  });

  describe('with instances', function () {
    it('should be able to add first instance', function (done) {
      var instances = [new Instance()];
      var pod = new Pod();
      expect(pod.instances).to.have.length(0);
      pod.addInstance(instances[0]._id, function (err, pod) {
        expect(err).to.equal(null);
        expect(pod.instances).to.have.length(1);
        done();
      });
    });

    it('should be able to add a second instance', function (done) {
      var instances = [new Instance(), new Instance()];
      var pod = new Pod({ instances: [instances[0]] });
      pod.addInstance(instances[1]._id, function (err, pod) {
        expect(pod.instances).to.have.length(2);
        done();
      });
    });

    it('should remove an instance', function (done) {
      var instances = [new Instance(), new Instance()];
      var pod = new Pod({ instances: instances });
      pod.removeInstance(instances[0]._id, function (err, pod) {
        expect(pod.instances).to.have.length(1);
        done();
      });
    });

    it('should populate the instances', function (done) {
      var instances = [new Instance(), new Instance()];
      var pod = new Pod({ instances: instances });
      sinon.stub(pod, 'populate', function () {
        // this == pod
        var args = Array.prototype.slice.call(arguments);
        var cb = args.pop();
        cb(null, this);
      });
      pod.getInstances(function (err, pod) {
        expect(err).to.equal(null);
        expect(pod.instances).to.have.length(2);
        expect(pod.populate.calledOnce).to.equal(true);
        pod.populate.restore();
        done();
      });
    });
  });
});

