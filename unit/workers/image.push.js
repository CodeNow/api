'use strict'
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')

const Docker = require('models/apis/docker')
const Worker = require('workers/image.push')

const lab = exports.lab = Lab.script()
require('sinon-as-promised')(Promise)

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const it = lab.it

describe('image.push unit test', function () {
  const testImageTag = 'registry.runnable.com/org/hash:gohash'
  let testJob

  beforeEach(function (done) {
    testJob = {
      imageTag: testImageTag
    }
    done()
  })

  describe('task', function () {
    beforeEach(function (done) {
      sinon.stub(Docker.prototype, 'pushImage').resolves()
      done()
    })

    afterEach(function (done) {
      Docker.prototype.pushImage.restore()
      done()
    })

    it('should push image', function (done) {
      Worker.task(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(Docker.prototype.pushImage)
        sinon.assert.calledWith(Docker.prototype.pushImage, testImageTag)
        done()
      })
    })
  }) // end valid job
}) // end image.push unit test
