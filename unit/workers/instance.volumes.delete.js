/**
 * @module unit/workers/instance.volumes.delete
 */
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

const InstanceService = require('models/services/instance-service')

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
      volumes: [{Name: 'volume hash here'}]
    }
    beforeEach(function (done) {
      sinon.stub(InstanceService, 'deleteInstanceVolumes').resolves()
      done()
    })

    afterEach(function (done) {
      InstanceService.deleteInstanceVolumes.restore()
      done()
    })
    describe('success', function () {
      it('should work without error', function (done) {
        Worker._deleteVolumes(testJob).asCallback(done)
      })

      it('should call deleteVolumes with correct args', function (done) {
        Worker._deleteVolumes(testJob)
          .tap(function () {
            sinon.assert.calledOnce(InstanceService.deleteInstanceVolumes)
            sinon.assert.calledWithExactly(InstanceService.deleteInstanceVolumes, testJob.volumes)
          })
          .asCallback(done)
      })
    })
  })
})
