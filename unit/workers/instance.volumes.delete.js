
'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const it = lab.it

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const Docker = require('models/apis/docker')

const Worker = require('workers/instance.volumes.delete')

describe('Instance Volumes Delete Worker', function () {
  describe('worker', function () {
    const testJob = {
      volumes: []
    }
    beforeEach(function (done) {
      sinon.stub(Worker, '_deleteVolumes').resolves()
      done()
    })

    afterEach(function (done) {
      Worker._deleteVolumes.restore()
      done()
    })

    it('should call _deleteVolumes with correct args', function (done) {
      Worker.task(testJob)
        .tap(function () {
          sinon.assert.calledOnce(Worker._deleteVolumes)
          sinon.assert.calledWithExactly(Worker._deleteVolumes, testJob)
        })
        .asCallback(done)
    })
  })

  describe('_deleteVolumes', function () {
    const testJob = {
      volume: {Name: 'volume hash here'}
    }
    beforeEach(function (done) {
      sinon.stub(Docker.prototype, 'deleteInstanceVolume').resolves()
      done()
    })

    afterEach(function (done) {
      Docker.prototype.deleteInstanceVolume.restore()
      done()
    })
    describe('success', function () {
      it('should work without error', function (done) {
        Worker._deleteVolumes(testJob).asCallback(done)
      })

      it('should call deleteVolume with correct args', function (done) {
        Worker._deleteVolumes(testJob)
          .tap(function () {
            sinon.assert.calledOnce(Docker.prototype.deleteInstanceVolume)
            sinon.assert.calledWithExactly(Docker.prototype.deleteInstanceVolume, testJob.volume)
          })
          .asCallback(done)
      })
    })
  })
})
