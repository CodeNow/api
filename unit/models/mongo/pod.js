'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;

var sinon = require('sinon');

var Pod = require('models/mongo/pod');
// need to require this to register the model
var Instance = require('models/mongo/instance');

describe('Pods', function () {

  describe('with graph', function () {
    var pod;
    var instances;
    beforeEach(function (done) {
      instances = [new Instance(), new Instance(), new Instance(), new Instance()];
      var i3 = instances[3].toJSON();
      i3.dependencies = {};
      var i2 = instances[2].toJSON();
      i2.dependencies = {};
      i2.dependencies[i3._id] = i3;
      var i1 = instances[1].toJSON();
      i1.dependencies = {};
      var i0 = instances[0].toJSON();
      i0.dependencies = {};
      i0.dependencies[i1._id] = i1;
      i0.dependencies[i2._id] = i2;
      sinon.stub(instances[0], 'populateDeps').yields(null, i0);
      pod = new Pod({ instances: instances });
      done();
    });
    
    it('should return a graph representation of the instances', function (done) {
      Pod.getPodWithInstance(instances[0], function (err, pod) {
        expect(err).to.equal(null);
        expect(pod.graph).to.be.an('object');
        expect(Object.keys(pod.graph)).to.have.length(4); // number of nodes
        expect(pod.graph[instances[0]._id].length).to.equal(2);
        expect(pod.graph[instances[1]._id].length).to.equal(0);
        expect(pod.graph[instances[2]._id].length).to.equal(1);
        expect(pod.graph[instances[3]._id].length).to.equal(0);
        expect(instances[0].populateDeps.calledOnce).to.be.true();
        instances[0].populateDeps.restore();
        done();
      });
    });
  });
});

