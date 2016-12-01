'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach

const Code = require('code')
const expect = Code.expect
const objectId = require('objectid')
const Promise = require('bluebird')
const sinon = require('sinon')

const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const rabbitMQ = require('models/rabbitmq')
const GitHub = require('models/apis/github')
const octobear = require('@runnable/octobear')

require('sinon-as-promised')(Promise)

describe('Docker Compose Cluster Service Unit Tests', function () {
  describe('create', function () {
    const clusterId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const clusterData = {
      _id: clusterId,
      dockerComposeFilePath: '/config/compose.yml',
      parentInstanceId: parentInstanceId,
      siblingsInstanceIds: [
        objectId('607f191e810c19729de860eb'),
        objectId('707f191e810c19729de860ec')
      ]
    }
    const testParsedContent = {
      results: [{
        metadata: {
          name: 'api',
          isMain: true
        },
        contextVersion: {
          advanced: true,
          buildDockerfilePath: '.'
        },
        files: { // Optional
          '/Dockerfile': {
            body: 'FROM node'
          }
        },
        instance: {
          name: 'api',
          containerStartCommand: 'npm start',
          ports: [80],
          env: ['HELLO=WORLD']
        }
      }]
    }
    const sessionUser = {
      _id: objectId('107f191e810c19729de860ee'),
      bigPoppaUser: {
        id: 123
      },
      accounts: {
        github: {
          username: 'runnabot',
          accessToken: 'some-token'
        }
      }
    }
    const dockerComposeContent = {
      name: 'docker-compose.yml',
      path: 'docker-compose.yml',
      sha: '13ec49b1014891c7b494126226f95e318e1d3e82',
      size: 193,
      url: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/contents/docker-compose.yml?ref=master',
      html_url: 'https://github.com/Runnable/compose-test-repo-1.2/blob/master/docker-compose.yml',
      git_url: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/git/blobs/13ec49b1014891c7b494126226f95e318e1d3e82',
      download_url: 'https://raw.githubusercontent.com/Runnable/compose-test-repo-1.2/master/docker-compose.yml',
      type: 'file',
      content: 'dmVyc2lvbjogJzInCnNlcnZpY2VzOgogIHdlYjoKICAgIGJ1aWxkOiAnLi9z\ncmMvJwogICAgY29tbWFuZDogW25vZGUsIGluZGV4LmpzXQogICAgcG9ydHM6\nCiAgICAgIC0gIjUwMDA6NTAwMCIKICAgIGVudmlyb25tZW50OgogICAgICAt\nIE5PREVfRU5WPWRldmVsb3BtZW50CiAgICAgIC0gU0hPVz10cnVlCiAgICAg\nIC0gSEVMTE89Njc4Cg==\n',
      encoding: 'base64',
      _links:
       { self: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/contents/docker-compose.yml?ref=master',
         git: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/git/blobs/13ec49b1014891c7b494126226f95e318e1d3e82',
         html: 'https://github.com/Runnable/compose-test-repo-1.2/blob/master/docker-compose.yml'
       }
    }
    const triggeredAction = 'webhook'
    const dockerComposeFileString = 'version: \'2\'\nservices:\n  web:\n    build: \'./src/\'\n    command: [node, index.js]\n    ports:\n      - "5000:5000"\n    environment:\n      - NODE_ENV=development\n      - SHOW=true\n      - HELLO=678\n'
    const repoName = 'Runnable/api'
    const branchName = 'feature-1'
    const dockerComposeFilePath = './compose.yml'
    const newInstanceName = 'api-unit'
    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'createAsync').resolves(new DockerComposeCluster(clusterData))
      sinon.stub(GitHub.prototype, 'getRepoContentAsync').resolves(dockerComposeContent)
      sinon.stub(octobear, 'parse').returns(testParsedContent)
      sinon.stub(rabbitMQ, 'clusterCreated').returns()
      done()
    })
    afterEach(function (done) {
      DockerComposeCluster.createAsync.restore()
      GitHub.prototype.getRepoContentAsync.restore()
      octobear.parse.restore()
      rabbitMQ.clusterCreated.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if getRepoContentAsync failed', function (done) {
        const error = new Error('Some error')
        GitHub.prototype.getRepoContentAsync.rejects(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if octobear.parse failed', function (done) {
        const error = new Error('Some error')
        octobear.parse.throws(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if createAsync failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.createAsync.rejects(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if clusterCreared failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.clusterCreated.throws(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName).asCallback(done)
      })

      it('should call getRepoContentAsync with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(GitHub.prototype.getRepoContentAsync)
          sinon.assert.calledWithExactly(GitHub.prototype.getRepoContentAsync, repoName, dockerComposeFilePath)
        })
        .asCallback(done)
      })

      it('should call octobear.parse with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(octobear.parse)
          const parserPayload = {
            dockerComposeFileString,
            repositoryName: newInstanceName,
            ownerUsername: sessionUser.accounts.github.username,
            userContentDomain: process.env.USER_CONTENT_DOMAIN
          }
          sinon.assert.calledWithExactly(octobear.parse, parserPayload)
        })
        .asCallback(done)
      })

      it('should call createAsync with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.createAsync)
          sinon.assert.calledWithExactly(DockerComposeCluster.createAsync, {
            dockerComposeFilePath,
            createdBy: sessionUser.bigPoppaUser.id,
            triggeredAction })
        })
        .asCallback(done)
      })

      it('should call clusterCreated with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(rabbitMQ.clusterCreated)
          const cluster = { id: clusterId.toString() }
          const payload = {
            cluster,
            parsedCompose: testParsedContent
          }
          sinon.assert.calledWithExactly(rabbitMQ.clusterCreated, payload)
        })
        .asCallback(done)
      })

      it('should call all the functions in the order', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.callOrder(
            GitHub.prototype.getRepoContentAsync,
            octobear.parse,
            DockerComposeCluster.createAsync,
            rabbitMQ.clusterCreated)
        })
        .asCallback(done)
      })
    })
  })
  describe('delete', function () {
    const clusterId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const clusterData = {
      _id: clusterId,
      dockerComposeFilePath: '/config/compose.yml',
      parentInstanceId: parentInstanceId,
      siblingsInstanceIds: [
        objectId('607f191e810c19729de860eb'),
        objectId('707f191e810c19729de860ec')
      ]
    }
    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'findByIdAndAssert').resolves(new DockerComposeCluster(clusterData))
      sinon.stub(DockerComposeCluster, 'markAsDeleted').resolves()
      sinon.stub(rabbitMQ, 'deleteInstance').returns()
      sinon.stub(rabbitMQ, 'clusterDeleted').returns()
      done()
    })
    afterEach(function (done) {
      DockerComposeCluster.findByIdAndAssert.restore()
      DockerComposeCluster.markAsDeleted.restore()
      rabbitMQ.deleteInstance.restore()
      rabbitMQ.clusterDeleted.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if findByIdAndAssert failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.findByIdAndAssert.rejects(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if deleteInstance failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.deleteInstance.throws(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if findByIdAndAssert failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.markAsDeleted.rejects(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if clusterDeleted failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.clusterDeleted.throws(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        DockerComposeClusterService.delete(clusterId.toString()).asCallback(done)
      })

      it('should call findByIdAndAssert with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.findByIdAndAssert)
          sinon.assert.calledWithExactly(DockerComposeCluster.findByIdAndAssert, clusterId.toString())
        })
        .asCallback(done)
      })

      it('should call deleteInstance with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledTwice(rabbitMQ.deleteInstance)
          sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: clusterData.siblingsInstanceIds[0] })
          sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: clusterData.siblingsInstanceIds[1] })
        })
        .asCallback(done)
      })

      it('should call markAsDeleted with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.markAsDeleted)
          sinon.assert.calledWithExactly(DockerComposeCluster.markAsDeleted, clusterId)
        })
        .asCallback(done)
      })

      it('should call clusterDeleted with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(rabbitMQ.clusterDeleted)
          const cluster = { id: clusterId.toString() }
          sinon.assert.calledWithExactly(rabbitMQ.clusterDeleted, { cluster })
        })
        .asCallback(done)
      })

      it('should call all the functions in the order', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.callOrder(
            DockerComposeCluster.findByIdAndAssert,
            rabbitMQ.deleteInstance,
            DockerComposeCluster.markAsDeleted,
            rabbitMQ.clusterDeleted)
        })
        .asCallback(done)
      })
    })
  })
})
