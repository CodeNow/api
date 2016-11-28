'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const Code = require('code')
const expect = Code.expect

const workerUtils = require('utils/worker-utils')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

describe('worker utils unit test', function () {
  describe('assertFound', function () {
    it('should not fail if model is defined', function (done) {
      const job = {
        instanceId: 1
      }
      const instance = {
        _id: 1,
        name: 'good-instance'
      }
      workerUtils.assertFound(job, 'Instance')(instance)
      done()
    })

    it('should throw WorkerStopError if model is not defined', function (done) {
      const job = {
        instanceId: 1
      }
      const query = {
        _id: 1
      }
      try {
        workerUtils.assertFound(job, 'Instance', query)(null)
        done(new Error('Should never happen'))
      } catch (err) {
        expect(err).to.be.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Instance not found')
        expect(err.data.extra).to.equal(query)
        done()
      }
    })
  })
})
