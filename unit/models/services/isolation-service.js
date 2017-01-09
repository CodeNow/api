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

var AutoIsolationConfig = require('models/mongo/auto-isolation-config')
var Bunyan = require('bunyan')
var Github = require('models/apis/github')
var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var Isolation = require('models/mongo/isolation')
var ObjectId = require('mongoose').Types.ObjectId
var rabbitMQ = require('models/rabbitmq')
var User = require('models/mongo/user')

var IsolationService = require('models/services/isolation-service')

describe('Isolation Services Model', function () {
  describe('#forkRepoChild', function () {
    var repoName = 'someRepo'
    var orgName = 'someOrg'
    var mockChildInfo
    var mockInstanceChildInfo
    var mockInstance = {
      _id: 'beef',
      name: 'instanceName',
      env: [ 'foo=bar' ],
      contextVersion: {
        appCodeVersions: [
          {
            repo: orgName + '/' + repoName
          }
        ]
      }
    }
    var mockBranchInfo = {
      commit: {
        sha: 'beefisgood'
      }
    }
    var mockMasterShortHash = 'deadbeef'
    var mockIsolationId = 'deadbeefdeadbeefdeadbeef'
    var mockSessionUser = { accounts: { github: { id: 4 } } }
    var mockNewInstance = { _id: 'new' }

    beforeEach(function (done) {
      mockChildInfo = {
        repo: repoName,
        branch: 'someBranch',
        org: orgName
      }
      mockInstanceChildInfo = {
        instance: 'beef',
        branch: 'someBranch'
      }
      sinon.stub(Instance, 'findMasterInstancesForRepo').yieldsAsync(null, [ mockInstance ])
      sinon.stub(Instance, 'findById').yieldsAsync(null, mockInstance)
      sinon.stub(InstanceForkService, 'forkRepoInstance').resolves(mockNewInstance)
      sinon.stub(Github.prototype, 'getBranch').yieldsAsync(null, mockBranchInfo)
      done()
    })

    afterEach(function (done) {
      Instance.findMasterInstancesForRepo.restore()
      Instance.findById.restore()
      InstanceForkService.forkRepoInstance.restore()
      Github.prototype.getBranch.restore()
      done()
    })

    describe('Validation', function () {
      it('should allow a `matchBranch` property in childInfo', function (done) {
        mockChildInfo.matchBranch = true
        IsolationService.forkRepoChild(mockChildInfo, '', '', mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            done()
          }
        )
      })

      describe('Validation Errors', function () {
        it('should require child info', function (done) {
          IsolationService.forkRepoChild()
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/childinfo.+required/i)
              done()
            }
          )
        })

        ;['repo', 'org'].forEach(function (k) {
          it('should require childInfo.' + k, function (done) {
            var info = omit(mockChildInfo, k)
            IsolationService.forkRepoChild(info, '', '', {})
              .asCallback(function (err) {
                expect(err).to.exist()
                expect(err.message).to.match(new RegExp('must.+contain.+' + k, 'i'))
                done()
              }
            )
          })
        })

        it('should require childInfo branch', function (done) {
          var info = omit(mockChildInfo, 'branch')
          IsolationService.forkRepoChild(info, '', '', {})
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(new RegExp('branch.+required', 'i'))
              done()
            }
          )
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
      })
    })

    describe('Errors', function () {
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

      it('should reject with any github error', function (done) {
        Github.prototype.getBranch.yieldsAsync(new Error('robot'))
        IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/robot/i)
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

      it('should reject if created with repo name and mutliple instances of that repo exist', function (done) {
        Instance.findMasterInstancesForRepo.yieldsAsync(null, [mockInstance, mockInstance])
        IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/determine.*instance.*fork/i)
            done()
          })
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

    it('should fetch the latest commit for the branch', function (done) {
      IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Github.prototype.getBranch)
          sinon.assert.calledWithExactly(
            Github.prototype.getBranch,
            'someOrg/someRepo',
            'someBranch',
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
              commit: 'beefisgood',
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

    it('should always use the repo name from the appCodeVersion in the instances', function (done) {
      var orgName = 'orgName'
      var repoName = 'wow'
      mockInstance.contextVersion.appCodeVersions[0] = { repo: orgName + '/' + repoName }
      IsolationService.forkRepoChild(mockChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceForkService.forkRepoInstance)
          sinon.assert.calledWithExactly(
            InstanceForkService.forkRepoInstance,
            mockInstance,
            sinon.match.has('repo', orgName + '/' + repoName),
            mockSessionUser
          )
          done()
        }
      )
    })

    describe('Create Instances By Instance Id', function () {
      beforeEach(function (done) {
        Instance.findMasterInstancesForRepo.yieldsAsync(null, [mockInstance, mockInstance])
        Instance.findById.yieldsAsync(null, mockInstance)
        done()
      })

      it('should create an isolation by using the instance ID', function (done) {
        IsolationService.forkRepoChild(mockInstanceChildInfo, mockMasterShortHash, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.notCalled(Instance.findMasterInstancesForRepo)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, mockInstanceChildInfo.instance)
            done()
          })
      })
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

  describe('#_updateDependenciesForInstanceWithChildren', function () {
    var mockMasterInstance = {
      lowerName: 'foo-api',
      name: 'foo-api',
      isolated: 'deadbeefdeadbeefdeadbeef',
      owner: { username: 'barnow' },
      isIsolationGroupMaster: true,
      contextVersion: {
        context: 'a312213123122'
      },
      elasticHostname: 'foo-api'
    }
    var mockOtherDependencyInstance = {
      _id: 'sadasdsadsad',
      name: 'redis',
      elasticHostname: 'redis'
    }
    var mockDependencyInstance = {
      _id: 'frf123fqwf3f',
      name: 'mongodb',
      elasticHostname: 'mongodb'
    }
    var mockChildInstance = {
      lowerName: 'deadbe--mongodb',
      name: 'deadbe--mongodb',
      owner: { username: 'barnow' },
      isolated: 'deadbeefdeadbeefdeadbeef',
      elasticHostname: 'mongodb'
    }
    var children = [mockMasterInstance, mockChildInstance]

    beforeEach(function (done) {
      mockMasterInstance.getDependenciesAsync = sinon.stub().resolves([
        mockDependencyInstance,
        mockOtherDependencyInstance
      ])
      mockMasterInstance.getElasticHostname = sinon.stub().returns('foo-api-staging-barnow.runnableapp.com')
      mockMasterInstance._doc = mockMasterInstance
      mockMasterInstance.addDependency = sinon.stub().resolves()
      mockMasterInstance.removeDependency = sinon.stub().resolves()
      mockChildInstance.getElasticHostname = sinon.stub().returns('deadbe--mongodb-staging-barnow.runnableapp.com')
      done()
    })
    describe('Errors', function () {
      it('should throw an error if the instance doesn\'t have an elasticHostname', function (done) {
        IsolationService._updateDependenciesForInstanceWithChildren(
          mockMasterInstance,
          [{
            lowerName: 'deadbe--mongodb',
            owner: { username: 'barnow' },
            isolated: 'deadbeefdeadbeefdeadbeef'
          }]
        )
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.include('is missing an elasticHostname')
            done()
          })
      })
      it('should throw an error if the instance doesn\'t have an elasticHostname', function (done) {
        mockMasterInstance.getDependenciesAsync.resolves([{}])
        IsolationService._updateDependenciesForInstanceWithChildren(
          mockMasterInstance,
          [{}]
        )
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.include('is missing an elasticHostname')
            done()
          })
      })
    })

    it('should fetch the dependencies for the instance', function (done) {
      IsolationService._updateDependenciesForInstanceWithChildren(mockMasterInstance, children)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockMasterInstance.getDependenciesAsync)
          done()
        })
    })

    it('should add dependencies discovered in the graph', function (done) {
      IsolationService._updateDependenciesForInstanceWithChildren(mockMasterInstance, children)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockMasterInstance.addDependency)
          sinon.assert.calledWithExactly(
            mockMasterInstance.addDependency,
            mockChildInstance
          )
          done()
        })
    })

    it('should remove previous dependencies matching ones we have isolated', function (done) {
      IsolationService._updateDependenciesForInstanceWithChildren(mockMasterInstance, children)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockMasterInstance.removeDependency)
          sinon.assert.calledWithExactly(
            mockMasterInstance.removeDependency,
            mockDependencyInstance._id
          )
          done()
        })
    })

    // this is a pretty redundant test (because of the calledOnce above), but it's very
    // important that we don't delete other nodes that were in the graph.
    it('should ignore other dependencies that were in the graph', function (done) {
      IsolationService._updateDependenciesForInstanceWithChildren(mockMasterInstance, children)
        .asCallback(function (err) {
          expect(err).to.not.exist(mockMasterInstance.removeDependency)
          for (var i = 0; i < mockMasterInstance.removeDependency.callCount; ++i) {
            var callCheck = mockMasterInstance.removeDependency.getCall(i).notCalledWith(
              mockOtherDependencyInstance._id
            )
            expect(callCheck).to.be.true()
          }
          done()
        })
    })
  })

  describe('#createIsolationAndEmitInstanceUpdates', function () {
    var mockRepoInstance = { org: 'Runnable', repo: 'someRepo', branch: 'someBranch' }
    var mockRepoInstanceWithMatchBranch = { org: 'Runnable', repo: 'someRepo', matchBranch: true }
    var mockRepoInstanceWithInstanceId = { instance: '123', branch: 'someOtherBranch' }
    var mockRepoInstanceWithInstanceIdAndMatchBranch = { instance: '123', matchBranch: true }
    var mockNonRepoInstance = { instance: 'childNonRepo' }
    var mockInstanceBranch = 'someWowCoolBranch'
    var mockInstance = {
      _id: 'deadbeef',
      shortHash: 'shorthash',
      contextVersion: {
        appCodeVersions: [{
          branch: mockInstanceBranch
        }]
      }
    }
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
      sinon.stub(IsolationService, 'updateDependenciesForIsolation').resolves(mockInstance)
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
      IsolationService.updateDependenciesForIsolation.restore()
      IsolationService._emitUpdateForInstances.restore()
      rabbitMQ.redeployInstanceContainer.restore()
      done()
    })

    describe('Validation', function () {
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

      describe('Validation Errors', function () {
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
      })
    })

    describe('Errors', function () {
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

      it('should reject with any updateDependenciesForIsolation error', function (done) {
        var error = new Error('pugsly')
        IsolationService.updateDependenciesForIsolation.rejects(error)
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

    it('should not fork any child instance if none are provided', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(IsolationService.forkNonRepoChild)
          sinon.assert.notCalled(IsolationService.forkRepoChild)
          done()
        })
    })

    it('should update all of the dependencies', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.updateDependenciesForIsolation)
          sinon.assert.calledWithExactly(
            IsolationService.updateDependenciesForIsolation,
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
          sinon.assert.notCalled(IsolationService.forkNonRepoChild)
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
          sinon.assert.notCalled(IsolationService.forkRepoChild)
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

    it('should fork any repo child instance created with an instanced ID', function (done) {
      isolationConfig.children.push(mockRepoInstanceWithInstanceId)
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.forkRepoChild)
          sinon.assert.notCalled(IsolationService.forkNonRepoChild)
          sinon.assert.calledWithExactly(
            IsolationService.forkRepoChild,
            mockRepoInstanceWithInstanceId,
            mockInstance.shortHash,
            mockNewIsolation._id,
            mockSessionUser
          )
          done()
        })
    })

    it('should fork any repo child instance created with an instanced ID and `matchBranch`', function (done) {
      isolationConfig.children.push(mockRepoInstanceWithInstanceIdAndMatchBranch)
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.forkRepoChild)
          sinon.assert.notCalled(IsolationService.forkNonRepoChild)
          sinon.assert.calledWithExactly(
            IsolationService.forkRepoChild,
            mockRepoInstanceWithInstanceIdAndMatchBranch,
            mockInstance.shortHash,
            mockNewIsolation._id,
            mockSessionUser
          )
          var firstArg = IsolationService.forkRepoChild.args[0][0]
          expect(firstArg.branch).to.exist()
          expect(firstArg.branch).to.equal(mockInstanceBranch)
          done()
        })
    })

    it('should fork any repo child instance created with an `repo`, `org`, and `matchBranch`', function (done) {
      isolationConfig.children.push(mockRepoInstanceWithMatchBranch)
      IsolationService.createIsolationAndEmitInstanceUpdates(isolationConfig, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.forkRepoChild)
          sinon.assert.notCalled(IsolationService.forkNonRepoChild)
          sinon.assert.calledWithExactly(
            IsolationService.forkRepoChild,
            mockRepoInstanceWithMatchBranch,
            mockInstance.shortHash,
            mockNewIsolation._id,
            mockSessionUser
          )
          var firstArg = IsolationService.forkRepoChild.args[0][0]
          expect(firstArg.branch).to.exist()
          expect(firstArg.branch).to.equal(mockInstanceBranch)
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
  describe('#deleteIsolatedChildren', function () {
    const isolationId = 'deadbeefdeadbeefdeadbeef'
    let mockChildInstances
    const mockChildInstance = {
      _id: 'childInstanceId',
      removeSelfFromGraph: sinon.stub()
    }

    beforeEach(function (done) {
      mockChildInstances = []
      sinon.stub(Instance, 'findAsync').resolves(mockChildInstances)
      sinon.stub(rabbitMQ, 'deleteInstance').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findAsync.restore()
      rabbitMQ.deleteInstance.restore()
      done()
    })

    describe('errors', function () {
      it('should require isolationId', function (done) {
        IsolationService.deleteIsolatedChildren().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolationId.+required/i)
          done()
        })
      })

      it('should reject with any findAsync errors', function (done) {
        const error = new Error('pugsly')
        Instance.findAsync.rejects(error)
        IsolationService.deleteIsolatedChildren(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any deleteInstance error', function (done) {
        mockChildInstances.push(mockChildInstance)
        const error = new Error('pugsly')
        rabbitMQ.deleteInstance.throws(error)
        IsolationService.deleteIsolatedChildren(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    describe('success', function () {
      it('should return no errors', function (done) {
        IsolationService.deleteIsolatedChildren(isolationId)
          .asCallback(done)
      })

      it('should call findAsync with correct args', function (done) {
        IsolationService.deleteIsolatedChildren(isolationId)
        .tap(function () {
          const findChildrenOpts = {
            isolated: isolationId,
            isIsolationGroupMaster: false
          }
          sinon.assert.calledOnce(Instance.findAsync)
          sinon.assert.calledWithExactly(Instance.findAsync, findChildrenOpts)
        })
        .asCallback(done)
      })

      it('should not delete any children instances (0)', function (done) {
        IsolationService.deleteIsolatedChildren(isolationId)
        .tap(function () {
          sinon.assert.notCalled(rabbitMQ.deleteInstance)
        })
        .asCallback(done)
      })

      it('should delete any children instances (1)', function (done) {
        mockChildInstances.push(mockChildInstance)
        IsolationService.deleteIsolatedChildren(isolationId)
        .tap(function () {
          sinon.assert.calledOnce(rabbitMQ.deleteInstance)
          sinon.assert.calledWithExactly(
            rabbitMQ.deleteInstance,
            { instanceId: mockChildInstance._id }
          )
        })
        .asCallback(done)
      })

      it('should delete any children instances (2)', function (done) {
        mockChildInstances.push(mockChildInstance, mockChildInstance)
        IsolationService.deleteIsolatedChildren(isolationId)
        .tap(function () {
          sinon.assert.calledTwice(rabbitMQ.deleteInstance)
        })
        .asCallback(done)
      })

      it('should do all the things in order', function (done) {
        mockChildInstances.push(mockChildInstance)
        IsolationService.deleteIsolatedChildren(isolationId)
        .tap(function () {
          sinon.assert.callOrder(Instance.findAsync, rabbitMQ.deleteInstance)
        })
        .asCallback(done)
      })
    })
  })

  describe('#deleteIsolation', function () {
    var isolationId = 'deadbeefdeadbeefdeadbeef'
    var mockIsolation = {}
    var mockInstance = {
      _id: 'foobar',
      createdBy: { github: 4 },
      owner: { username: 'owner' },
      elasticHostname: 'foobar',
      setDependenciesFromEnvironmentAsync: sinon.stub()
    }
    var mockChildInstance = {
      _id: 'childInstanceId',
      removeSelfFromGraph: sinon.stub()
    }

    beforeEach(function (done) {
      mockInstance.deIsolate = sinon.stub().resolves(mockInstance)
      sinon.stub(IsolationService, '_removeIsolationFromEnv').resolves(mockInstance)
      sinon.stub(IsolationService, 'deleteIsolatedChildren').resolves([])
      sinon.stub(Instance, 'findOne').yieldsAsync(null, mockInstance)
      sinon.stub(Isolation, 'findOneAndRemove').yieldsAsync(null, mockIsolation)
      sinon.stub(IsolationService, '_emitUpdateForInstances').resolves()
      sinon.stub(rabbitMQ, 'redeployInstanceContainer').returns()
      mockInstance.setDependenciesFromEnvironmentAsync.reset()
      mockChildInstance.removeSelfFromGraph.reset()
      done()
    })

    afterEach(function (done) {
      IsolationService.deleteIsolatedChildren.restore()
      Instance.findOne.restore()
      Isolation.findOneAndRemove.restore()
      IsolationService._emitUpdateForInstances.restore()
      IsolationService._removeIsolationFromEnv.restore()
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

      it('should reject with any deleteIsolatedChildren errors', function (done) {
        var error = new Error('pugsly')
        IsolationService.deleteIsolatedChildren.rejects(error)
        IsolationService.deleteIsolation(isolationId)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
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
        mockInstance.setDependenciesFromEnvironmentAsync.rejects(error)
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

    it('should delete isolated children', function (done) {
      IsolationService.deleteIsolation(isolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.deleteIsolatedChildren)
          sinon.assert.calledWithExactly(IsolationService.deleteIsolatedChildren, isolationId)
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
          sinon.assert.calledOnce(mockInstance.setDependenciesFromEnvironmentAsync)
          sinon.assert.calledWithExactly(mockInstance.setDependenciesFromEnvironmentAsync, mockInstance.owner.username)
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
          sinon.assert.callOrder(
            mockInstance.deIsolate,
            IsolationService.deleteIsolatedChildren,
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

  describe('autoIsolate', function () {
    var mockInstance = {
      _id: 'foobar',
      parent: 'parentId',
      createdBy: { github: 1 }
    }
    var mockAIC = { requestedDependencies: [] }
    var mockInstanceUser = { user: 1 }
    var mockPushUser = { user: 2 }
    var pushInfo = { user: { id: 2 } }

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null, mockInstance)
      sinon.stub(AutoIsolationConfig, 'findActiveByInstanceId').resolves(mockAIC)
      sinon.stub(User, 'findByGithubId').yieldsAsync(new Error('nope'))
        .withArgs(1).yieldsAsync(null, mockInstanceUser)
        .withArgs(2).yieldsAsync(null, mockPushUser)
      sinon.stub(IsolationService, 'createIsolationAndEmitInstanceUpdates').resolves()
      done()
    })

    afterEach(function (done) {
      Instance.findOne.restore()
      AutoIsolationConfig.findActiveByInstanceId.restore()
      User.findByGithubId.restore()
      IsolationService.createIsolationAndEmitInstanceUpdates.restore()
      done()
    })

    it('should find each instance', function (done) {
      IsolationService.autoIsolate(mockInstance, pushInfo)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findOne)
          sinon.assert.calledWithExactly(
            Instance.findOne,
            { shortHash: 'parentId' },
            sinon.match.func
          )
          done()
        })
    })

    it('should look for auto isolation config', function (done) {
      IsolationService.autoIsolate(mockInstance, pushInfo)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(AutoIsolationConfig.findActiveByInstanceId)
          sinon.assert.calledWithExactly(
            AutoIsolationConfig.findActiveByInstanceId, 'foobar'
          )
          done()
        })
    })

    it('should find a user from the instance', function (done) {
      IsolationService.autoIsolate(mockInstance, pushInfo)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(User.findByGithubId)
          sinon.assert.calledWithExactly(
            User.findByGithubId,
            1,
            sinon.match.func
          )
          done()
        })
    })

    it('should find a user from the push info', function (done) {
      IsolationService.autoIsolate(mockInstance, pushInfo)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(User.findByGithubId)
          sinon.assert.calledWithExactly(
            User.findByGithubId,
            2,
            sinon.match.func
          )
          done()
        })
    })

    it('should find a user from the push info', function (done) {
      IsolationService.autoIsolate(mockInstance, pushInfo)
      .asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(IsolationService.createIsolationAndEmitInstanceUpdates)
        sinon.assert.calledWithExactly(
          IsolationService.createIsolationAndEmitInstanceUpdates,
          {
            master: 'foobar',
            children: [],
            redeployOnKilled: false
          },
          { user: 2 }
        )
        done()
      })
    })

    it('should keep the `matchBranch` property when passed in a child config', function (done) {
      var child = {
        instance: new ObjectId(),
        matchBranch: true
      }
      var mockAIC = { requestedDependencies: [ child ] }
      AutoIsolationConfig.findActiveByInstanceId.resolves(mockAIC)

      IsolationService.autoIsolate(mockInstance, pushInfo)
      .asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(IsolationService.createIsolationAndEmitInstanceUpdates)
        sinon.assert.calledWithExactly(
          IsolationService.createIsolationAndEmitInstanceUpdates,
          {
            master: 'foobar',
            children: [{
              instance: child.instance.toString(),
              matchBranch: true
            }],
            redeployOnKilled: false
          },
          { user: 2 }
        )
        done()
      })
    })

    it('should copy over redeployOnKilled flag', function (done) {
      mockAIC.redeployOnKilled = true
      AutoIsolationConfig.findActiveByInstanceId.resolves(mockAIC)
      IsolationService.autoIsolate(mockInstance, pushInfo)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(IsolationService.createIsolationAndEmitInstanceUpdates)
          sinon.assert.calledWithExactly(
            IsolationService.createIsolationAndEmitInstanceUpdates,
            {
              master: 'foobar',
              children: [],
              redeployOnKilled: true
            },
            { user: 2 }
          )
          done()
        })
    })
  })

  describe('isTestingIsolation', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAsync').resolves({ _id: 'instance-id' })
      done()
    })

    afterEach(function (done) {
      Instance.findOneAsync.restore()
      done()
    })

    it('should fail if mongo call failed', function (done) {
      Instance.findOneAsync.rejects(new Error('Mongo error'))
      IsolationService.isTestingIsolation('iso-id')
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    it('should return true if instance was found', function (done) {
      IsolationService.isTestingIsolation('iso-id')
      .tap(function (isTesting) {
        expect(isTesting).to.equal(true)
      })
      .asCallback(done)
    })

    it('should return false if instance was not found', function (done) {
      Instance.findOneAsync.resolves(null)
      IsolationService.isTestingIsolation('iso-id')
      .tap(function (isTesting) {
        expect(isTesting).to.equal(false)
      })
      .asCallback(done)
    })

    it('should pass correct params', function (done) {
      IsolationService.isTestingIsolation('iso-id')
      .tap(function (isTesting) {
        sinon.assert.calledOnce(Instance.findOneAsync)
        sinon.assert.calledWith(Instance.findOneAsync, {
          isolated: 'iso-id',
          isIsolationGroupMaster: true,
          isTesting: true
        })
      })
      .asCallback(done)
    })
  })

  describe('redeployIfAllKilled', function () {
    var mockIsolation
    var mockInstances
    var mockUpdatedIsolation
    var mockIsolationId

    beforeEach(function (done) {
      mockIsolationId = 'mockIsolationId1234'
      mockIsolation = {
        _id: 'mockIsolationId'
      }
      mockUpdatedIsolation = {
        _id: 'mockUpdatedIsolationId'
      }
      mockInstances = []
      sinon.stub(Isolation, 'findOneAsync').resolves(mockIsolation)
      sinon.stub(Instance, 'findAsync').resolves(mockInstances)
      sinon.stub(Isolation, 'findOneAndUpdateAsync').resolves(mockUpdatedIsolation)
      sinon.stub(rabbitMQ, 'redeployIsolation')
      done()
    })

    afterEach(function (done) {
      Isolation.findOneAsync.restore()
      Instance.findAsync.restore()
      Isolation.findOneAndUpdateAsync.restore()
      rabbitMQ.redeployIsolation.restore()
      done()
    })

    it('should fail if Isolation.findOneAsync fails', function (done) {
      var error = new Error('Mongo error')
      Isolation.findOneAsync.rejects(error)
      IsolationService.redeployIfAllKilled(mockIsolationId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
    })

    it('should fail if Instance.findAsync fails', function (done) {
      var error = new Error('Mongo error')
      Instance.findAsync.rejects(error)
      IsolationService.redeployIfAllKilled(mockIsolationId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
    })

    it('should fail if Isolation.findOneAndUpdateAsync fails', function (done) {
      var error = new Error('Mongo error')
      Isolation.findOneAndUpdateAsync.rejects(error)
      IsolationService.redeployIfAllKilled(mockIsolationId)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
    })

    it('should call Isolation.findOneAsync', function (done) {
      IsolationService.redeployIfAllKilled(mockIsolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Isolation.findOneAsync)
          sinon.assert.calledWith(Isolation.findOneAsync, {
            _id: mockIsolationId,
            redeployOnKilled: true,
            state: 'killing'
          })
          done()
        })
    })

    it('should call Instance.findAsync', function (done) {
      IsolationService.redeployIfAllKilled(mockIsolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findAsync)
          sinon.assert.calledWith(Instance.findAsync, {
            isolated: mockIsolationId,
            $or: [
              { 'container.inspect.State.Stopping': true },
              { 'container.inspect.State.Running': true }
            ]
          })
          done()
        })
    })

    it('should call Isolation.findOneAndUpdateAsync', function (done) {
      IsolationService.redeployIfAllKilled(mockIsolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Isolation.findOneAndUpdateAsync)
          sinon.assert.calledWith(Isolation.findOneAndUpdateAsync, {
            _id: mockIsolationId,
            redeployOnKilled: true,
            state: 'killing'
          }, {
            $set: {
              state: 'killed'
            }
          })
          done()
        })
    })

    it('should call rabbitMQ.redeployIsolation', function (done) {
      IsolationService.redeployIfAllKilled(mockIsolationId)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(rabbitMQ.redeployIsolation)
          sinon.assert.calledWith(rabbitMQ.redeployIsolation, {
            isolationId: mockIsolationId
          })
          done()
        })
    })
  })
})
