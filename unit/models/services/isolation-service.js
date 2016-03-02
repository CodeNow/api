'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var omit = require('101/omit')
var pick = require('101/pick')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Bunyan = require('bunyan')
var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var Isolation = require('models/mongo/isolation')
var rabbitMQ = require('models/rabbitmq')

var IsolationService = require('models/services/isolation-service')

describe('Isolation Services Model', function () {
  describe('#forkRepoChild', function () {
    var mockChildInfo
    var mockInstance = {
      _id: 'beef',
      name: 'instanceName',
      env: [ 'foo=bar' ]
    }
    var mockMasterShortHash = 'deadbeef'
    var mockIsolationId = 'deadbeefdeadbeefdeadbeef'
    var mockSessionUser = { accounts: { github: { id: 4 } } }
    var mockNewInstance = { _id: 'new' }

    beforeEach(function (done) {
      mockChildInfo = {
        repo: 'someRepo',
        branch: 'someBranch',
        org: 'someOrg'
      }
      sinon.stub(Instance, 'findMasterInstancesForRepo').yieldsAsync(null, [ mockInstance ])
      sinon.stub(InstanceForkService, 'forkRepoInstance').resolves(mockNewInstance)
      done()
    })

    afterEach(function (done) {
      Instance.findMasterInstancesForRepo.restore()
      InstanceForkService.forkRepoInstance.restore()
      done()
    })

    describe('errors', function () {
      it('should require child info', function (done) {
        IsolationService.forkRepoChild()
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/childinfo.+required/i)
            done()
          }
        )
      })

      ;[ 'repo', 'org', 'branch' ].forEach(function (k) {
        it('should require childInfo.' + k, function (done) {
          var info = omit(mockChildInfo, k)
          return IsolationService.forkRepoChild(info)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(new RegExp('childinfo.' + k + '.+required', 'i'))
              done()
            }
          )
        })
      })

      it('should require a short hash', function (done) {
        IsolationService.forkRepoChild(mockChildInfo)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/masterinstanceshorthash.+required/i)
            done()
          }
        )
      })

      it('should require an isolation id', function (done) {
        IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/isolationid.+required/i)
            done()
          }
        )
      })

      it('should require a session user', function (done) {
        IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/sessionuser.+required/i)
            done()
          }
        )
      })

      it('should reject with any findMasterInstancesForRepo error', function (done) {
        var error = new Error('pugsly')
        Instance.findMasterInstancesForRepo.yieldsAsync(error)
        IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          }
        )
      })

      it('should reject if findMasterInstancesForRepo returns not an array', function (done) {
        Instance.findMasterInstancesForRepo.yieldsAsync(null, '')
        IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/could not find any instance to fork/i)
            done()
          }
        )
      })

      it('should reject if findMasterInstancesForRepo returns an empty array', function (done) {
        Instance.findMasterInstancesForRepo.yieldsAsync(null, [])
        IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/could not find any instance to fork/i)
            done()
          }
        )
      })

      it('should reject with any forkRepoInstance error', function (done) {
        var error = new Error('pugsly')
        InstanceForkService.forkRepoInstance.rejects(error)
        IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          }
        )
      })
    })

    it('should find our instance by repo and branch', function (done) {
      IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findMasterInstancesForRepo)
          sinon.assert.calledWithExactly(
            Instance.findMasterInstancesForRepo,
            'someOrg/someRepo',
            sinon.match.func
          )
          done()
        }
      )
    })

    it('should fork said instance using the forkRepoInstance', function (done) {
      IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceForkService.forkRepoInstance)
          sinon.assert.calledWithExactly(
            InstanceForkService.forkRepoInstance,
            mockInstance,
            {
              name: 'deadbeef--instanceName',
              env: [ 'foo=bar' ],
              isolated: mockIsolationId,
              isIsolationGroupMaster: false,
              repo: 'someOrg/someRepo',
              branch: 'someBranch',
              // FIXME(bkendall): this isn't valid
              commit: sinon.match.string,
              user: { id: mockSessionUser.accounts.github.id }
            },
            mockSessionUser
          )
          done()
        }
      )
    })

    it('should resolve with the newly forked instance', function (done) {
      IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
        .asCallback(function (err, newInstance) {
          expect(err).to.not.exist()
          expect(newInstance).to.equal(mockNewInstance)
          done()
        }
      )
    })
  })

  describe('#forkNonRepoChild', function () {
    var mockInstanceId = 'mockInstanceId'
    var mockIsolationId = 'mockIsolationId'
    var mockSessionUser = {}
    var mockInstance = { _id: mockInstanceId }
    var mockNewInstance = { _id: 'newInstance' }
    var mockMasterName = 'branch-repo'

    beforeEach(function (done) {
      sinon.stub(Instance, 'findById').yieldsAsync(null, mockInstance)
      sinon.stub(InstanceForkService, 'forkNonRepoInstance').resolves(mockNewInstance)
      done()
    })

    afterEach(function (done) {
      Instance.findById.restore()
      InstanceForkService.forkNonRepoInstance.restore()
      done()
    })

    describe('errors', function () {
      describe('validation', function () {
        it('should require instanceId', function (done) {
          IsolationService.forkNonRepoChild()
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/instanceid.+required/i)
              done()
            })
        })

        it('should require masterInstanceShortHash', function (done) {
          IsolationService.forkNonRepoChild(mockInstanceId)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/masterinstanceshorthash.+required/i)
              done()
            })
        })

        it('should require isolationId', function (done) {
          IsolationService.forkNonRepoChild(mockInstanceId, mockMasterName)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/isolationid.+required/i)
              done()
            })
        })

        it('should require sessionUser', function (done) {
          IsolationService.forkNonRepoChild(mockInstanceId, mockMasterName, mockIsolationId)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/sessionuser.+required/i)
              done()
            })
        })
      })

      it('should reject with any findOne error', function (done) {
        var error = new Error('pugsly')
        Instance.findById.yieldsAsync(error)
        IsolationService.forkNonRepoChild(mockInstanceId, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any forkNonRepoInstance error', function (done) {
        var error = new Error('pugsly')
        InstanceForkService.forkNonRepoInstance.rejects(error)
        IsolationService.forkNonRepoChild(mockInstanceId, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })
    })

    it('should find the instance', function (done) {
      IsolationService.forkNonRepoChild(mockInstanceId, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findById)
          sinon.assert.calledWithExactly(
            Instance.findById,
            mockInstanceId,
            sinon.match.func
          )
          done()
        })
    })

    it('should fork the instance', function (done) {
      IsolationService.forkNonRepoChild(mockInstanceId, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceForkService.forkNonRepoInstance)
          sinon.assert.calledWithExactly(
            InstanceForkService.forkNonRepoInstance,
            mockInstance,
            mockMasterName,
            mockIsolationId,
            mockSessionUser
          )
          done()
        })
    })

    it('should search then fork', function (done) {
      IsolationService.forkNonRepoChild(mockInstanceId, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.callOrder(
            Instance.findById,
            InstanceForkService.forkNonRepoInstance
          )
          done()
        })
    })

    it('should return the new forked instance', function (done) {
      IsolationService.forkNonRepoChild(mockInstanceId, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err, newInstance) {
          expect(err).to.not.exist()
          expect(newInstance).to.equal(mockNewInstance)
          done()
        })
    })
  })

  describe('#_updateMasterEnv', function () {
    var mockMaster = {
      _id: 'mockMasterId',
      shortHash: 'beef',
      owner: {
        username: 'myorg'
      }
    }
    var mockChildOne = {
      _id: 'mockChildOneId',
      lowerName: 'beef--childone'
    }
    var mockChildTwo = {
      _id: 'mockChildTwoId',
      lowerName: 'beef--childtwo'
    }
    var mockChildren
    var mockUpdatedMaster = { _id: 'mockMasterId', __v: 2 }

    beforeEach(function (done) {
      mockMaster.env = [ 'childone-staging-myorg.' + process.env.USER_CONTENT_DOMAIN ]
      mockChildren = [ mockChildOne ]
      mockUpdatedMaster.setDependenciesFromEnvironmentAsync = sinon.stub().resolves(mockUpdatedMaster)
      sinon.stub(Instance, 'findOneAndUpdateAsync').resolves(mockUpdatedMaster)
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdateAsync.restore()
      done()
    })

    describe('errors', function () {
      it('should require a master', function (done) {
        IsolationService._updateMasterEnv().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/master.+required/)
          done()
        })
      })

      it('should require children', function (done) {
        IsolationService._updateMasterEnv(mockMaster).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/children.+required/)
          done()
        })
      })

      it('should require children to be an array', function (done) {
        IsolationService._updateMasterEnv(mockMaster, {}).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/children.+array/)
          done()
        })
      })

      describe('when updates are made', function () {
        it('should reject with any database error', function (done) {
          var error = new Error('pugsly')
          Instance.findOneAndUpdateAsync.rejects(error)
          IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
        })

        it('should reject with any dependencies update error', function (done) {
          var error = new Error('pugsly')
          mockUpdatedMaster.setDependenciesFromEnvironmentAsync.rejects(error)
          IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
        })
      })
    })

    it('should not replace env values if none match', function (done) {
      mockMaster.env[0] = mockMaster.env[0].replace('childone', 'otherchild')
      IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
        done()
      })
    })

    it('should replace envs values of non-repo containers if it exists', function (done) {
      IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdateAsync,
          { _id: mockMaster._id },
          {
            $set: {
              env: [
                'beef--childone-staging-myorg.' + process.env.USER_CONTENT_DOMAIN
              ]
            }
          }
        )
        done()
      })
    })

    it('should replace multiple envs values of non-repo containers if it exists', function (done) {
      mockMaster.env.push('childtwo-staging-myorg.' + process.env.USER_CONTENT_DOMAIN)
      mockChildren.push(mockChildTwo)
      IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdateAsync,
          { _id: mockMaster._id },
          {
            $set: {
              env: [
                'beef--childone-staging-myorg.' + process.env.USER_CONTENT_DOMAIN,
                'beef--childtwo-staging-myorg.' + process.env.USER_CONTENT_DOMAIN
              ]
            }
          }
        )
        done()
      })
    })

    it('should ignore envs that do not match', function (done) {
      mockMaster.env.push('childthree-staging-myorg.' + process.env.USER_CONTENT_DOMAIN)
      IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdateAsync,
          { _id: mockMaster._id },
          {
            $set: {
              env: [
                'beef--childone-staging-myorg.' + process.env.USER_CONTENT_DOMAIN,
                'childthree-staging-myorg.' + process.env.USER_CONTENT_DOMAIN
              ]
            }
          }
        )
        done()
      })
    })

    it('should do nothing with extra children', function (done) {
      mockMaster.env.push('childthree-staging-myorg.' + process.env.USER_CONTENT_DOMAIN)
      mockChildren.push(mockChildTwo)
      IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdateAsync,
          { _id: mockMaster._id },
          {
            $set: {
              env: [
                'beef--childone-staging-myorg.' + process.env.USER_CONTENT_DOMAIN,
                'childthree-staging-myorg.' + process.env.USER_CONTENT_DOMAIN
              ]
            }
          }
        )
        done()
      })
    })

    it('should return the updated instance model', function (done) {
      IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.equal(mockUpdatedMaster)
        done()
      })
    })

    it('should not replace env values if none match', function (done) {
      mockMaster.env[0] = mockMaster.env[0].replace('childone', 'otherchild')
      IsolationService._updateMasterEnv(mockMaster, mockChildren).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.equal(mockMaster)
        done()
      })
    })
  })

  describe('#createIsolationAndEmitInstanceUpdates', function () {
    var mockRepoInstance = { org: 'Runnable', repo: 'someRepo', branch: 'someBranch' }
    var mockNonRepoInstance = { instance: 'childNonRepo' }
    var mockInstance = { _id: 'deadbeef', shortHash: 'shorthash' }
    var mockNewChildInstance = { _id: 'newChildInstanceId' }
    var mockNewChildRepoInstance = { _id: 'newChildRepoInstanceId' }
    var mockNewIsolation = { _id: 'newIsolationId' }
    var mockSessionUser = { accounts: { github: { id: 44 } } }
    var isolationConfig

    beforeEach(function (done) {
      isolationConfig = {
        master: 'masterInstanceId',
        children: []
      }
      mockInstance.isolate = sinon.stub().resolves(mockInstance)
      sinon.stub(Isolation, '_validateMasterNotIsolated').resolves(mockInstance)
      sinon.stub(Isolation, '_validateCreateData').resolves()
      sinon.stub(Isolation, 'createIsolation').resolves(mockNewIsolation)
      sinon.stub(IsolationService, 'forkRepoChild').resolves(mockNewChildRepoInstance)
      sinon.stub(IsolationService, 'forkNonRepoChild').resolves(mockNewChildInstance)
      sinon.stub(IsolationService, '_updateMasterEnv').resolves(mockInstance)
      sinon.stub(IsolationService, '_emitUpdateForInstances').resolves()
      sinon.stub(rabbitMQ, 'redeployInstanceContainer').returns()
      done()
    })

    afterEach(function (done) {
      Isolation._validateMasterNotIsolated.restore()
      Isolation._validateCreateData.restore()
      Isolation.createIsolation.restore()
      IsolationService.forkRepoChild.restore()
      IsolationService.forkNonRepoChild.restore()
      IsolationService._updateMasterEnv.restore()
      IsolationService._emitUpdateForInstances.restore()
      rabbitMQ.redeployInstanceContainer.restore()
      done()
    })

    describe('errors', function () {
      it('should require isolationConfig', function (done) {
        IsolationService.createIsolationAndEmitInstanceUpdates().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolationConfig.+required/i)
          done()
        })
      })

      it('should require sessionUser', function (done) {
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/user.+required/i)
          done()
        })
      })

      it('should reject with any isolationConfig validation error', function (done) {
        var error = new Error('pugsly')
        Isolation._validateCreateData.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any master validation error', function (done) {
        var error = new Error('pugsly')
        Isolation._validateMasterNotIsolated.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any isolation create error', function (done) {
        var error = new Error('pugsly')
        Isolation.createIsolation.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any master instance update error', function (done) {
        var error = new Error('pugsly')
        mockInstance.isolate.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any _updateMasterEnv error', function (done) {
        var error = new Error('pugsly')
        IsolationService._updateMasterEnv.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any forkRepoChild error', function (done) {
        var error = new Error('pugsly')
        IsolationService.forkRepoChild.rejects(error)
        isolationConfig.children.push(mockRepoInstance)
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any forkNonRepoChild error', function (done) {
        var error = new Error('pugsly')
        IsolationService.forkNonRepoChild.rejects(error)
        isolationConfig.children.push(mockNonRepoInstance)
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any redeployInstanceContainer error', function (done) {
        var error = new Error('pugsly')
        rabbitMQ.redeployInstanceContainer.throws(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    it('should validate the isolation isolationConfig', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Isolation._validateCreateData)
          sinon.assert.calledWithExactly(
            Isolation._validateCreateData,
            pick(isolationConfig, [ 'master', 'children' ])
          )
          done()
        })
    })

    it('should validate the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Isolation._validateMasterNotIsolated)
          sinon.assert.calledWithExactly(
            Isolation._validateMasterNotIsolated,
            'masterInstanceId'
          )
          done()
        })
    })

    it('should create a new isolation', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Isolation.createIsolation)
          sinon.assert.calledWithExactly(
            Isolation.createIsolation,
            pick(isolationConfig, [ 'master', 'children' ])
          )
          done()
        })
    })

    it('should create the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockInstance.isolate)
          sinon.assert.calledWithExactly(
            mockInstance.isolate,
            mockNewIsolation._id,
            true // markes as isolation group master
          )
          done()
        })
    })

    it('should not fork any child instance if none provide', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(IsolationService.forkNonRepoChild)
          done()
        })
    })

    it('should update the master env', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService._updateMasterEnv)
          sinon.assert.calledWithExactly(
            IsolationService._updateMasterEnv,
            mockInstance,
            []
          )
          done()
        })
    })

    it('should fork any repo child instance provided', function (done) {
      isolationConfig.children.push(mockRepoInstance)
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.forkRepoChild)
          // FIXME: this isn't going to be right
          sinon.assert.calledWithExactly(
            IsolationService.forkRepoChild,
            mockRepoInstance,
            mockInstance.shortHash,
            mockNewIsolation._id,
            mockSessionUser
          )
          done()
        })
    })

    it('should fork any non-repo child instances provided', function (done) {
      isolationConfig.children.push(mockNonRepoInstance)
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.forkNonRepoChild)
          sinon.assert.calledWithExactly(
            IsolationService.forkNonRepoChild,
            mockNonRepoInstance.instance,
            mockInstance.shortHash,
            mockNewIsolation._id,
            mockSessionUser
          )
          done()
        })
    })

    it('should emit events for the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.called(IsolationService._emitUpdateForInstances)
          sinon.assert.calledWithExactly(
            IsolationService._emitUpdateForInstances,
            [ mockInstance ],
            mockSessionUser
          )
          done()
        })
    })

    it('should emit events for the non-repo children instance', function (done) {
      isolationConfig.children.push(mockNonRepoInstance)
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.called(IsolationService._emitUpdateForInstances)
          sinon.assert.calledWithExactly(
            IsolationService._emitUpdateForInstances,
            [ mockNewChildInstance ],
            mockSessionUser
          )
          done()
        })
    })

    it('should emit events for the repo children instance', function (done) {
      isolationConfig.children.push(mockRepoInstance)
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.called(IsolationService._emitUpdateForInstances)
          sinon.assert.calledWithExactly(
            IsolationService._emitUpdateForInstances,
            [ mockNewChildRepoInstance ],
            mockSessionUser
          )
          done()
        })
    })

    it('should enqueue a job to redeploy the instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(rabbitMQ.redeployInstanceContainer)
          sinon.assert.calledWithExactly(
            rabbitMQ.redeployInstanceContainer,
            {
              instanceId: mockInstance._id,
              sessionUserGithubId: mockSessionUser.accounts.github.id
            }
          )
          done()
        })
    })

    it('should return the new isolation', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err, newIsolation) {
          expect(err).to.not.exist()
          expect(newIsolation).to.equal(mockNewIsolation)
          done()
        })
    })
  })

  describe('#_emitUpdateForInstances', function () {
    var mockInstance = { _id: 'mockInstanceId' }
    var mockInstances
    var mockSessionUser = { session: 'user' }

    beforeEach(function (done) {
      mockInstances = []
      mockInstance.emitInstanceUpdateAsync = sinon.stub().resolves()
      mockInstances.push(mockInstance)
      sinon.stub(Bunyan.prototype, 'warn')
      done()
    })

    afterEach(function (done) {
      Bunyan.prototype.warn.restore()
      done()
    })

    describe('errors', function () {
      describe('validation', function () {
        it('should require instances', function (done) {
          IsolationService._emitUpdateForInstances().asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/instances.+required/i)
            done()
          })
        })

        it('should require sessionUser', function (done) {
          IsolationService._emitUpdateForInstances(mockInstances).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/sessionuser.+required/i)
            done()
          })
        })
      })

      it('should not reject with emit errors, but log', function (done) {
        var error = new Error('pugsly')
        mockInstance.emitInstanceUpdateAsync.rejects(error)
        IsolationService._emitUpdateForInstances(mockInstances, mockSessionUser).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Bunyan.prototype.warn)
          sinon.assert.calledWithExactly(
            Bunyan.prototype.warn,
            sinon.match.object,
            'isolation service failed to emit instance updates'
          )
          done()
        })
      })
    })

    it('should emit events for all instances passed in (0)', function (done) {
      IsolationService._emitUpdateForInstances([], mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.notCalled(mockInstance.emitInstanceUpdateAsync)
        done()
      })
    })

    it('should emit events for all instances passed in (1)', function (done) {
      IsolationService._emitUpdateForInstances(mockInstances, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(mockInstance.emitInstanceUpdateAsync)
        sinon.assert.calledWithExactly(
          mockInstance.emitInstanceUpdateAsync,
          mockSessionUser,
          'isolation'
        )
        done()
      })
    })

    it('should emit events for all instances passed in (2)', function (done) {
      mockInstances.push(mockInstance)
      IsolationService._emitUpdateForInstances(mockInstances, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledTwice(mockInstance.emitInstanceUpdateAsync)
        done()
      })
    })
  })

  describe('#_removeIsolationFromEnv', function () {
    var mockInstance = {
      _id: 'mockInstanceId',
      shortHash: 'foobar',
      owner: { username: 'bartothefoo' }
    }
    var mockUpdatedInstance = { _id: 'mockInstanceId', __v: 2 }

    beforeEach(function (done) {
      mockInstance.env = []
      mockUpdatedInstance.setDependenciesFromEnvironmentAsync = sinon.stub().resolves(mockUpdatedInstance)
      sinon.stub(Instance, 'findOneAndUpdateAsync').resolves(mockUpdatedInstance)
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdateAsync.restore()
      done()
    })

    describe('errors', function () {
      it('should require an instance', function (done) {
        IsolationService._removeIsolationFromEnv().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/instance.+required/i)
          done()
        })
      })

      it('should reject with any findOneAndUpdate error', function (done) {
        var error = new Error('pugsly')
        mockInstance.env.push('FOO=foobar--thing.etc.com')
        Instance.findOneAndUpdateAsync.rejects(error)
        IsolationService._removeIsolationFromEnv(mockInstance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should reject with any setDependenciesFromEnvironment error', function (done) {
        var error = new Error('pugsly')
        mockInstance.env.push('FOO=foobar--thing.etc.com')
        mockUpdatedInstance.setDependenciesFromEnvironmentAsync.rejects(error)
        IsolationService._removeIsolationFromEnv(mockInstance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    it('should not replace anything if no envs are present', function (done) {
      IsolationService._removeIsolationFromEnv(mockInstance).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
        done()
      })
    })

    it('should not replace anything if no envs match', function (done) {
      mockInstance.env.push('BAR=bar--thing.etc.com')
      IsolationService._removeIsolationFromEnv(mockInstance).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
        done()
      })
    })

    it('should return the instance if no updates made', function (done) {
      mockInstance.env.push('BAR=bar--thing.etc.com')
      IsolationService._removeIsolationFromEnv(mockInstance).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.equal(mockInstance)
        done()
      })
    })

    describe('with matching envs', function () {
      beforeEach(function (done) {
        mockInstance.env.push('FOO=foobar--thing.etc.com')
        done()
      })

      it('should replace isolation related envs', function (done) {
        IsolationService._removeIsolationFromEnv(mockInstance).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
          sinon.assert.calledWithExactly(
            Instance.findOneAndUpdateAsync,
            { _id: mockInstance._id },
            { $set: { env: [ 'FOO=thing.etc.com' ] } }
          )
          done()
        })
      })

      it('should update the dependencies', function (done) {
        IsolationService._removeIsolationFromEnv(mockInstance).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockUpdatedInstance.setDependenciesFromEnvironmentAsync)
          sinon.assert.calledWithExactly(
            mockUpdatedInstance.setDependenciesFromEnvironmentAsync,
            'bartothefoo'
          )
          done()
        })
      })

      it('should return the updated instance', function (done) {
        IsolationService._removeIsolationFromEnv(mockInstance).asCallback(function (err, instance) {
          expect(err).to.not.exist()
          expect(instance).to.equal(mockUpdatedInstance)
          done()
        })
      })
    })
  })

  describe('#deleteIsolation', function () {
    var isolationId = 'deadbeefdeadbeefdeadbeef'
    var mockIsolation = {}
    var mockInstance = { _id: 'foobar', createdBy: { github: 4 } }
    var mockChildInstances
    var mockChildInstance = { _id: 'childInstanceId' }

    beforeEach(function (done) {
      mockChildInstances = []
      mockInstance.deIsolate = sinon.stub().resolves(mockInstance)
      sinon.stub(IsolationService, '_removeIsolationFromEnv').resolves(mockInstance)
      sinon.stub(Instance, 'find').yieldsAsync(null, mockChildInstances)
      sinon.stub(Instance, 'findOne').yieldsAsync(null, mockInstance)
      sinon.stub(Isolation, 'findOneAndRemove').yieldsAsync(null, mockIsolation)
      sinon.stub(IsolationService, '_emitUpdateForInstances').resolves()
      sinon.stub(rabbitMQ, 'deleteInstance').returns()
      sinon.stub(rabbitMQ, 'redeployInstanceContainer').returns()
      done()
    })

    afterEach(function (done) {
      Instance.find.restore()
      Instance.findOne.restore()
      Isolation.findOneAndRemove.restore()
      IsolationService._emitUpdateForInstances.restore()
      IsolationService._removeIsolationFromEnv.restore()
      rabbitMQ.deleteInstance.restore()
      rabbitMQ.redeployInstanceContainer.restore()
      done()
    })

    describe('errors', function () {
      it('should require isolationId', function (done) {
        IsolationService.deleteIsolation().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolationId.+required/i)
          done()
        })
      })

      it('should reject with any findOne errors', function (done) {
        var error = new Error('pugsly')
        Instance.findOne.yieldsAsync(error)
        IsolationService.deleteIsolation(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject if it cannot find the instance', function (done) {
        Instance.findOne.yieldsAsync(null, null)
        IsolationService.deleteIsolation(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/no instance found/i)
            done()
          })
      })

      it('should reject with any deIsolate errors', function (done) {
        var error = new Error('pugsly')
        mockInstance.deIsolate.rejects(error)
        IsolationService.deleteIsolation(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any _removeIsolationFromEnv errors', function (done) {
        var error = new Error('pugsly')
        IsolationService._removeIsolationFromEnv.rejects(error)
        IsolationService.deleteIsolation(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any findOneAndRemove errors', function (done) {
        var error = new Error('pugsly')
        Isolation.findOneAndRemove.yieldsAsync(error)
        IsolationService.deleteIsolation(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any redeployInstanceContainer error', function (done) {
        var error = new Error('pugsly')
        rabbitMQ.redeployInstanceContainer.throws(error)
        IsolationService.deleteIsolation(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    it('should find the instance that is isolated by the given id', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findOne)
          sinon.assert.calledWithExactly(
            Instance.findOne,
            {
              isolated: isolationId,
              isIsolationGroupMaster: true
            },
            sinon.match.func
          )
          done()
        })
    })

    it('should find all children in the isolation group', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.find)
          sinon.assert.calledWithExactly(
            Instance.find,
            {
              isolated: isolationId,
              isIsolationGroupMaster: false
            },
            sinon.match.func
          )
          done()
        })
    })

    it('should deisolate the instance', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockInstance.deIsolate)
          sinon.assert.calledWithExactly(mockInstance.deIsolate)
          done()
        })
    })

    it('should update the envs of the instance', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService._removeIsolationFromEnv)
          sinon.assert.calledWithExactly(IsolationService._removeIsolationFromEnv, mockInstance)
          done()
        })
    })

    it('should remove the isolation', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Isolation.findOneAndRemove)
          sinon.assert.calledWithExactly(
            Isolation.findOneAndRemove,
            { _id: isolationId },
            sinon.match.func
          )
          done()
        })
    })

    it('should delete any children instances (0)', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(rabbitMQ.deleteInstance)
          done()
        })
    })

    it('should delete any children instances (1)', function (done) {
      mockChildInstances.push(mockChildInstance)
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(rabbitMQ.deleteInstance)
          sinon.assert.calledWithExactly(
            rabbitMQ.deleteInstance,
            { instanceId: mockChildInstance._id }
          )
          done()
        })
    })

    it('should delete any children instances (2)', function (done) {
      mockChildInstances.push(mockChildInstance, mockChildInstance)
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(rabbitMQ.deleteInstance)
          done()
        })
    })

    it('should enqueue a job to redeploy the container', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(rabbitMQ.redeployInstanceContainer)
          sinon.assert.calledWith(
            rabbitMQ.redeployInstanceContainer,
            {
              instanceId: mockInstance._id,
              sessionUserGithubId: mockInstance.createdBy.github
            }
          )
          done()
        })
    })

    it('should do all the things in order', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          Instance.findOne.calledBefore(mockInstance.deIsolate)
          Instance.find.calledBefore(mockInstance.deIsolate)
          sinon.assert.callOrder(
            mockInstance.deIsolate,
            IsolationService._removeIsolationFromEnv,
            Isolation.findOneAndRemove,
            rabbitMQ.redeployInstanceContainer
          )
          done()
        })
    })

    it('should return the updated instance', function (done) {
      IsolationService.deleteIsolation(isolationId).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.equal(mockInstance)
        done()
      })
    })
  })

  describe('#deleteIsolationAndEmitInstanceUpdates', function (done) {
    var isolationId = 'deadbeefdeadbeefdeadbeef'
    var mockInstance = { _id: 'foobar' }
    var mockSessionUser = { accounts: {} }

    beforeEach(function (done) {
      sinon.stub(IsolationService, 'deleteIsolation').resolves(mockInstance)
      sinon.stub(IsolationService, '_emitUpdateForInstances').resolves()
      done()
    })

    afterEach(function (done) {
      IsolationService.deleteIsolation.restore()
      IsolationService._emitUpdateForInstances.restore()
      done()
    })

    describe('errors', function () {
      it('should require isolationId', function (done) {
        IsolationService.deleteIsolationAndEmitInstanceUpdates().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolationId.+required/i)
          done()
        })
      })

      it('should require sessionUser', function (done) {
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/sessionUser.+required/i)
          done()
        })
      })

      it('should reject with any deleteIsolation error', function (done) {
        var error = new Error('pugsly')
        IsolationService.deleteIsolation.rejects(error)
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(err)
            done()
          })
      })

      it('should reject with any _emitUpdateForInstances error', function (done) {
        var error = new Error('pugsly')
        IsolationService._emitUpdateForInstances.rejects(error)
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(err)
            done()
          })
      })
    })

    it('should delete the isolation', function (done) {
      IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.deleteIsolation)
          sinon.assert.calledWithExactly(
            IsolationService.deleteIsolation,
            isolationId
          )
          done()
        })
    })

    it('should emit events for the updated instance', function (done) {
      IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService._emitUpdateForInstances)
          sinon.assert.calledWithExactly(
            IsolationService._emitUpdateForInstances,
            [ mockInstance ],
            mockSessionUser
          )
          done()
        })
    })
  })
})
