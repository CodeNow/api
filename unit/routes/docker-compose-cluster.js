/**
 * @module unit/routes/docker-compose-cluster
 */
'use strict'
require('loadenv')()

const Promise = require('bluebird')
const Lab = require('lab')
const sinon = require('sinon')
const Code = require('code')
require('sinon-as-promised')(Promise)

const joi = require('utils/joi')
const rabbitMQ = require('models/rabbitmq')
const postRoute = require('routes/docker-compose-cluster').postRoute
const deleteRoute = require('routes/docker-compose-cluster').deleteRoute

const lab = exports.lab = Lab.script()
const describe = lab.describe
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach
const expect = Code.expect
const it = lab.it

describe('/docker-compose-cluster', function () {
  let resMock
  let validateOrBoomStub
  const sessionUserGithubId = 1981198
  beforeEach(function (done) {
    resMock = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis()
    }
    done()
  })

  describe('post', function () {
    let createClusterStub
    let reqMock
    const repo = 'octobear'
    const branch = 'master'
    const dockerComposeFilePath = '/docker-compose.yml'
    const name = 'super-cool-name'
    beforeEach(function (done) {
      createClusterStub = sinon.stub(rabbitMQ, 'createCluster')
      validateOrBoomStub = sinon.spy(joi, 'validateOrBoomAsync')
      reqMock = {
        body: { repo, branch, dockerComposeFilePath, name },
        sessionUser: {
          accounts: { github: { id: sessionUserGithubId } }
        }
      }
      done()
    })
    afterEach(function (done) {
      createClusterStub.restore()
      validateOrBoomStub.restore()
      done()
    })

    describe('Errors', function () {
      it('should throw a Boom error if the schema is not correct', function (done) {
        postRoute({ body: {} }, resMock)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.equal(true)
            expect(err.output.statusCode).to.equal(400)
            expect(err.message).to.match(/is.*required/i)
            done()
          })
      })
    })

    describe('Success', function () {
      it('should validate the body', function (done) {
        postRoute(reqMock, resMock)
          .then(function () {
            sinon.assert.calledOnce(validateOrBoomStub)
          })
          .asCallback(done)
      })

      it('should enqueue a job', function (done) {
        postRoute(reqMock, resMock)
          .then(function () {
            sinon.assert.calledOnce(createClusterStub)
            sinon.assert.calledWith(createClusterStub, {
              sessionUserGithubId,
              triggeredAction: 'user',
              repoName: repo,
              branchName: branch,
              dockerComposeFilePath,
              newInstanceName: name
            })
          })
          .asCallback(done)
      })

      it('should return a 202', function (done) {
        postRoute(reqMock, resMock)
          .then(function () {
            sinon.assert.calledOnce(resMock.status)
            sinon.assert.calledWith(resMock.status, 202)
            sinon.assert.calledOnce(resMock.json)
            sinon.assert.calledWith(resMock.json, { message: sinon.match.string })
            done()
          })
      })
    })
  })

  describe('delete', function () {
    let deleteClusterStub
    let reqMock
    const clusterId = '584051538b7b54bb6511aeb6'
    beforeEach(function (done) {
      deleteClusterStub = sinon.stub(rabbitMQ, 'deleteCluster')
      validateOrBoomStub = sinon.spy(joi, 'validateOrBoomAsync')
      reqMock = {
        body: { cluster: { id: clusterId } },
        sessionUser: {
          accounts: { github: { id: sessionUserGithubId } }
        }
      }
      done()
    })
    afterEach(function (done) {
      deleteClusterStub.restore()
      validateOrBoomStub.restore()
      done()
    })
    describe('Errors', function () {
      it('should throw a Boom error if the schema is not correct', function (done) {
        deleteRoute({ body: {} }, resMock)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.equal(true)
            expect(err.output.statusCode).to.equal(400)
            expect(err.message).to.match(/is.*required/i)
            done()
          })
      })
    })

    describe('Success', function () {
      it('should validate the body', function (done) {
        deleteRoute(reqMock, resMock)
          .then(function () {
            sinon.assert.calledOnce(validateOrBoomStub)
          })
          .asCallback(done)
      })

      it('should enqueue a job', function (done) {
        deleteRoute(reqMock, resMock)
          .then(function () {
            sinon.assert.calledOnce(deleteClusterStub)
            sinon.assert.calledWith(deleteClusterStub, {
              cluster: { id: clusterId }
            })
          })
          .asCallback(done)
      })

      it('should return a 202', function (done) {
        deleteRoute(reqMock, resMock)
          .then(function () {
            sinon.assert.calledOnce(resMock.status)
            sinon.assert.calledWith(resMock.status, 202)
            sinon.assert.calledOnce(resMock.json)
            sinon.assert.calledWith(resMock.json, { message: sinon.match.string })
            done()
          })
      })
    })
  })
})
