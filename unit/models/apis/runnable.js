'use strict'

var sinon = require('sinon')
var noop = require('101/noop')
var Boom = require('dat-middleware').Boom
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect

var Runnable = require('models/apis/runnable')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Runnable: ' + moduleName, function () {
  describe('#forkMasterInstance', function () {
    it('should create new instance with branch-masterName pattern', function (done) {
      var runnable = new Runnable({})
      var master = {
        shortHash: 'd1as6213a',
        name: 'inst1',
        env: ['x=1'],
        owner: { github: { id: 1 } }
      }
      sinon.stub(Runnable.prototype, 'createInstance', function (inst) {
        expect(inst.parent).to.equal(master.shortHash)
        expect(inst.env).to.equal(master.env)
        expect(inst.name).to.equal('feature-1-inst1')
        expect(inst.owner.github.id).to.equal(master.owner.github.id)
        expect(inst.build).to.equal('build1')
        expect(inst.autoForked).to.equal(true)
        expect(inst.masterPod).to.equal(false)
        Runnable.prototype.createInstance.restore()
        done()
      })
      runnable.forkMasterInstance(master, 'build1', 'feature-1', noop)
    })

    it('should sanitize branch name', function (done) {
      var runnable = new Runnable({})
      var master = {
        shortHash: 'd1as6213a',
        name: 'inst1',
        env: ['x=1'],
        owner: { github: { id: 1 } }
      }
      sinon.stub(Runnable.prototype, 'createInstance', function (inst) {
        expect(inst.parent).to.equal(master.shortHash)
        expect(inst.env).to.equal(master.env)
        expect(inst.name).to.equal('a1-b2-c3-d4-e5-f6-g7-h7-inst1')
        expect(inst.owner.github.id).to.equal(master.owner.github.id)
        expect(inst.build).to.equal('build1')
        expect(inst.autoForked).to.equal(true)
        expect(inst.masterPod).to.equal(false)
        Runnable.prototype.createInstance.restore()
        done()
      })
      runnable.forkMasterInstance(master, 'build1', 'a1/b2/c3-d4,e5.f6 g7_h7', noop)
    })

    it('should fail if instance create failed', function (done) {
      var runnable = new Runnable({})
      var master = {
        shortHash: 'd1as6213a',
        name: 'inst1',
        env: ['x=1'],
        owner: { github: { id: 1 } }
      }
      sinon.stub(Runnable.prototype, 'createInstance', function (inst, cb) {
        var err = Boom.notFound('Error happened')
        cb(err)
      })
      runnable.forkMasterInstance(master, 'build1', 'b1', function (err) {
        expect(err).to.exist()
        expect(err.output.payload.message).to.equal('Error happened')
        done()
      })
    })
  })
})
