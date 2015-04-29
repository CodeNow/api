'use strict';

var sinon = require('sinon');
var noop = require('101/noop');
var Boom = require('dat-middleware').Boom;
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var Runnable = require('models/apis/runnable');


describe('Runnable', function () {

  describe('#forkMasterInstance', function () {

    it('should create new instance with branch-masterName pattern', function (done) {
      var runnable = new Runnable({});
      var master = {
        shortHash: 'd1as6213a',
        name: 'inst1',
        env: ['x=1'],
        owner: {github: {id: 1}}
      };
      sinon.stub(Runnable.prototype, 'createInstance', function (inst) {
        expect(inst.parent).to.equal(master.shortHash);
        expect(inst.env).to.equal(master.env);
        expect(inst.name).to.equal('branch1-inst1');
        expect(inst.owner.github.id).to.equal(master.owner.github.id);
        expect(inst.build).to.equal('build1');
        expect(inst.autoForked).to.equal(true);
        expect(inst.masterPod).to.equal(false);
        Runnable.prototype.createInstance.restore();
        done();
      });
      runnable.forkMasterInstance(master, 'build1', 'branch1', noop);
    });

    it('should escape slashes in the branc names', function (done) {
      var runnable = new Runnable({});
      var master = {
        shortHash: 'd1as6213a',
        name: 'inst1',
        env: ['x=1'],
        owner: {github: {id: 1}}
      };
      sinon.stub(Runnable.prototype, 'createInstance', function (inst) {
        expect(inst.parent).to.equal(master.shortHash);
        expect(inst.env).to.equal(master.env);
        expect(inst.name).to.equal('a1-b2-c3-inst1');
        expect(inst.owner.github.id).to.equal(master.owner.github.id);
        expect(inst.build).to.equal('build1');
        expect(inst.autoForked).to.equal(true);
        expect(inst.masterPod).to.equal(false);
        Runnable.prototype.createInstance.restore();
        done();
      });
      runnable.forkMasterInstance(master, 'build1', 'a1/b2/c3', noop);
    });

    it('should create new instance and append -1 if name exists', function (done) {
      var runnable = new Runnable({});
      var master = {
        shortHash: 'd1as6213a',
        name: 'inst1',
        env: ['x=1'],
        owner: {github: {id: 1}}
      };
      sinon.stub(Runnable.prototype, 'createInstance', function (inst, cb) {
        var err = Boom.conflict('instance with lowerName already exists');
        sinon.stub(Runnable.prototype, 'forkMasterInstance', function (masterInst, buildId, branch) {
          expect(branch).to.equal('b1-1');
          Runnable.prototype.createInstance.restore();
          Runnable.prototype.forkMasterInstance.restore();
          done();
        });
        cb(err);
      });
      runnable.forkMasterInstance(master, 'build1', 'b1', noop);
    });
  });
});
