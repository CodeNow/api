'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var sinon = require('sinon')
var Promise = require('bluebird')
var pluck = require('101/pluck')
var assign = require('101/assign')
var createCount = require('callback-count')

var mongoFactory = require('../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')
var IsolationService = require('models/services/isolation-service.js')
require('sinon-as-promised')(require('bluebird'))

describe('Isolation Services Integration Tests', function () {
  before(mongooseControl.start)
  var ctx
  var forked = {}
  beforeEach(function (done) {
    ctx = {}
    forked = {}

    done()
  })

  beforeEach(require('../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../functional/fixtures/clean-mongo').removeEverything)
  after(mongooseControl.stop)
  beforeEach(function (done) {
    ctx.mockUsername = 'TEST-login'
    ctx.mockSessionUser = {
      _id: 1234,
      findGithubUserByGithubId: sinon.stub().yieldsAsync(null, {
        login: ctx.mockUsername,
        avatar_url: 'TEST-avatar_url'
      }),
      accounts: {
        github: {
          id: 1234,
          username: ctx.mockUsername
        }
      }
    }
    done()
  })
  function createNewInstance (name, isolatedOpts, contextId) {
    return function (done) {
      isolatedOpts = isolatedOpts || {}
      var opts = assign({
        name: name,
        username: ctx.mockUsername
      }, isolatedOpts)
      var count = createCount(1, function (err) {
        if (err) {
          return done(err)
        }
        mongoFactory.createInstanceWithProps(ctx.mockSessionUser._id, opts, function (err, instance) {
          if (err) {
            return done(err)
          }
          ctx[name] = instance
          done(null, instance)
        })
      })
      if (contextId) {
        count.inc()
        mongoFactory.createStartedCv(ctx.mockSessionUser._id, {
          context: contextId
        }, function (err, cv) {
          opts.cv = cv
          count.next(err)
        })
      }
      count.next()
    }
  }
  var createNewInstanceAsync = function (name, isolatedOpts, contextId) {
    return Promise.fromCallback(function (cb) {
      createNewInstance(name, isolatedOpts, contextId)(cb)
    })
  }
  beforeEach(createNewInstance('Frontend', { masterPod: true }))
  beforeEach(createNewInstance('Api', { masterPod: true }))
  beforeEach(createNewInstance('Link', { masterPod: true }))
  beforeEach(createNewInstance('RabbitMQ', { masterPod: true }))
  beforeEach(createNewInstance('MongoDB', { masterPod: true }))
  beforeEach(createNewInstance('CodependentDatabase1', { masterPod: true }))
  beforeEach(createNewInstance('CodependentDatabase2', { masterPod: true }))
  beforeEach(function (done) {
    sinon.stub(ctx.Frontend, 'getMainBranchName').returns('master')
    sinon.stub(ctx.Api, 'getMainBranchName').returns('master')
    sinon.stub(ctx.Link, 'getMainBranchName').returns('master')
    sinon.stub(ctx.RabbitMQ, 'getMainBranchName').returns('master')
    sinon.stub(ctx.MongoDB, 'getMainBranchName').returns('master')

    sinon.stub(ctx.CodependentDatabase1, 'getMainBranchName').returns('master')
    sinon.stub(ctx.CodependentDatabase2, 'getMainBranchName').returns('master')
    done()
  })
  beforeEach(function (done) {
    // create dependency Links
    Promise.each(Object.keys(dependencyMap), function (instanceName) {
      return makeDependecies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
    })
    .asCallback(done)
  })
  beforeEach(function (done) {
    Promise.each(Object.keys(dependencyMap), function (instanceName) {
      return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
    })
    .asCallback(done)
  })
  var dependencyMap = {
    Frontend: ['Api'],
    Api: ['MongoDB', 'Link'],
    Link: ['MongoDB', 'RabbitMQ'],
    CodependentDatabase1: ['CodependentDatabase2'],
    CodependentDatabase2: ['CodependentDatabase1']
  }

  /**
   * Gets the actual dependency instances linked to a master.  If the instance is not in the provided
   * FROM map, then just get it from ctx.  This helps testing since anything connected to something
   * not in forked should still be connected to the originals
   * @param from {Object} ctx of forked
   * @param master
   * @returns {*}
   */
  function getDependencyInstances (from, master) {
    if (!dependencyMap[master]) { return null }
    return dependencyMap[master].map(function (depName) {
      return from[depName] || ctx[depName]
    })
  }

  /**
   * This function creates connections in Neo4J to simulate what our API does
   * @param {Instance} master
   * @param {[Instance]} dependents
   * @returns {Promise}
   */
  function makeDependecies (master, dependents) {
    if (!dependents) { return null }
    return Promise.each(dependents, function (dependentInstance) {
      return master.addDependencyAsync(
        dependentInstance,
        dependentInstance.getElasticHostname(ctx.mockUsername)
      )
    })
  }

  /**
   * This function checks Neo4J to see if all of the given instances are actually connected
   * @param {Instance} master
   * @param {[Instance]} dependents
   * @returns {Promise}
   */
  function checkDependencies (master, dependents) {
    if (!master) { return null }
    return master.getDependenciesAsync()
      .then(function (nodeArray) {
        return nodeArray.map(pluck('name'))
      })
      .then(function (nodeNameArray) {
        // make this list only dependents that weren't in the nodeArray
        var missingDependents = dependents.filter(function (child) {
          return nodeNameArray.indexOf(child.name) === -1
        })
        return missingDependents.length ? missingDependents : null
      })
      .then(function (missingDependencies) {
        if (missingDependencies) {
          throw new Error('The dependencies for ' + master.name + ' were all wrong! Missing these: ' +
            missingDependencies.map(pluck('name')).join(',')
          )
        }
      })
  }

  function createForks (masterName, childNameArray) {
    function createInstance (instanceName, isMaster) {
      var dashes = isMaster ? '-' : '--'
      var isolationOpts = {}
      if (isMaster) {
        isolationOpts.isIsolationGroupMaster = true
      } else {
        isolationOpts.isolated = forked[masterName]._id
      }
      isolationOpts.branch = 'branch1'
      var name = ctx[masterName].shortHash + dashes + instanceName
      return createNewInstanceAsync(name, isolationOpts, ctx[instanceName].contextVersion.context)
        .then(function (instanceModel) {
          forked[instanceName] = instanceModel
          return instanceModel
        })
    }
    return createInstance(masterName, true)
      .then(function () {
        return Promise.map(childNameArray, function (instanceName) {
          return createInstance(instanceName)
        })
      })
      .then(function connectAllForkedDepsToOrginalUnforked (childInstanceArray) {
        // This emulates when each of these instances get configured from their envs
        return Promise.each(Object.keys(forked), function (instanceName) {
          // It should take these newly forked instances, and bind them to the original master
          // (ctx) branches.
          return makeDependecies(forked[instanceName], getDependencyInstances(ctx, instanceName))
        })
          .return(childInstanceArray)
      })
  }

  describe('_updateDependenciesForInstanceWithChildren', function () {
    describe('Master\'s dependecies', function () {
      var toFork = ['Api', 'Link', 'MongoDB']
      beforeEach(function (done) {
        createForks('Frontend', toFork)
          .asCallback(done)
      })
      it('should connect iFrontend to iApi', function (done) {
        IsolationService._updateDependenciesForInstanceWithChildren(ctx.Frontend, [forked.Api])
          .then(function () {
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              if (instanceName === 'Frontend') {
                return checkDependencies(ctx.Frontend, [forked.Api])
              }
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .asCallback(done)
      })
      it('should connect iApi to iLink and iMongo', function (done) {
        // first fork Link, then master
        var children = [forked.Link, forked.MongoDB]
        IsolationService._updateDependenciesForInstanceWithChildren(ctx.Api, children)
          .then(function () {
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              if (instanceName === 'Api') {
                return checkDependencies(ctx.Api, children)
              }
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .asCallback(done)
      })
    })
  })
  describe('updateDependenciesForIsolation', function () {
    var forkedDependencyMap = {}
    describe('Forking the top of the pod', function () {
      it('should connect Frontend to the new Api server', function (done) {
        forkedDependencyMap = {
          Frontend: ['Api']
        }
        createForks('Frontend', ['Api'])
          .then(function (isolatedChildrenArray) {
            return IsolationService.updateDependenciesForIsolation(forked.Frontend, isolatedChildrenArray)
          })
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            // Check the Isolation Master
            return checkDependencies(forked.Frontend, getDependencyInstances(forked, 'Frontend'))
          })
          .then(function () {
            // Check the forked Api (since we didn't send any of the other forks with
            // updateDependenciesForIsolation, none of it's
            return checkDependencies(forked.Api, getDependencyInstances(forked, 'Api'))
          })
          .asCallback(done)
      })
      it('should connect all isolated instances except Mongo', function (done) {
        // This is what the dependency map should look like for the forked instances
        forkedDependencyMap = {
          Frontend: ['Api'],
          Api: ['Link'], // Mongo isn't in here because it's going to be loaded from the unforked
          Link: ['RabbitMQ']
        }
        // first fork Link, then master
        createForks('Frontend', ['Api', 'Link', 'RabbitMQ'])
          .then(function (isolatedChildrenArray) {
            return IsolationService.updateDependenciesForIsolation(forked.Frontend, isolatedChildrenArray)
          })
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (isolatedInstanceName) {
              return checkDependencies(
                forked[isolatedInstanceName],
                getDependencyInstances(forked, isolatedInstanceName)
              )
            })
          })
          .asCallback(done)
      })
      it('should connect iLink and iRabbit', function (done) {
        forkedDependencyMap = {
          Frontend: [/* Empty, since api isn't getting forked */],
          Link: ['RabbitMQ']
        }
        createForks('Frontend', ['Link', 'RabbitMQ'])
          .then(function (isolatedChildrenArray) {
            return IsolationService.updateDependenciesForIsolation(forked.Frontend, isolatedChildrenArray)
          })
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (isolatedInstanceName) {
              return checkDependencies(
                forked[isolatedInstanceName],
                getDependencyInstances(forked, isolatedInstanceName)
              )
            })
          })
          .asCallback(done)
      })
      it('should connect nothing to iRabbit', function (done) {
        forkedDependencyMap = {
          Frontend: [/* Empty, since api isn't getting forked */],
          Link: ['RabbitMQ']
        }
        createForks('Frontend', ['Link', 'RabbitMQ'])
          .then(function (isolatedChildrenArray) {
            return IsolationService.updateDependenciesForIsolation(forked.Frontend, isolatedChildrenArray)
          })
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (isolatedInstanceName) {
              return checkDependencies(
                forked[isolatedInstanceName],
                getDependencyInstances(forked, isolatedInstanceName)
              )
            })
          })
          .asCallback(done)
      })
      it('should connect iApi to iMongo, but Link should stay with Mongo', function (done) {
        forkedDependencyMap = {
          Frontend: ['Api'],
          Api: ['MongoDB']
        }
        createForks('Frontend', ['Api', 'MongoDB'])
          .then(function (isolatedChildrenArray) {
            return IsolationService.updateDependenciesForIsolation(forked.Frontend, isolatedChildrenArray)
          })
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (isolatedInstanceName) {
              return checkDependencies(
                forked[isolatedInstanceName],
                getDependencyInstances(forked, isolatedInstanceName)
              )
            })
          })
          .then(function () {
            // Just to be sure iApi is connected to iMongo
            return checkDependencies(forked.Api, [ctx.Link, forked.MongoDB])
          })
          .then(function () {
            // Just to be sure Link is still with Mongo
            return checkDependencies(ctx.Link, [ctx.MongoDB])
          })
          .asCallback(done)
      })
      it('should connect iLink to iMongo, but Api should stay with Mongo', function (done) {
        forkedDependencyMap = {
          Frontend: [/* Empty, since api isn't getting forked */],
          Link: ['MongoDB']
        }
        createForks('Frontend', ['Link', 'MongoDB'])
          .then(function (isolatedChildrenArray) {
            return IsolationService.updateDependenciesForIsolation(forked.Frontend, isolatedChildrenArray)
          })
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (isolatedInstanceName) {
              return checkDependencies(
                forked[isolatedInstanceName],
                getDependencyInstances(forked, isolatedInstanceName)
              )
            })
          })
          .then(function () {
            // Just to be sure Api is connected to Mongo
            return checkDependencies(ctx.Api, [ctx.Link, ctx.MongoDB])
          })
          .then(function () {
            // Just to be sure Link is still with Mongo
            return checkDependencies(forked.Link, [forked.MongoDB])
          })
          .asCallback(done)
      })
    })

    describe('Forking from the middle, Api', function () {
      it('should connect all isolated instances except Mongo', function (done) {
        // This is what the dependency map should look like for the forked instances
        forkedDependencyMap = {
          Frontend: ['Api'],
          Api: ['Link'],
          Link: ['RabbitMQ']
        }
        // first fork Link, then master

        createForks('Api', ['Link', 'RabbitMQ', 'Frontend'])
          .then(function (isolatedChildrenArray) {
            return IsolationService.updateDependenciesForIsolation(forked.Api, isolatedChildrenArray)
          })
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (isolatedInstanceName) {
              return checkDependencies(
                forked[isolatedInstanceName],
                getDependencyInstances(forked, isolatedInstanceName)
              )
            })
          })
          .asCallback(done)
      })
    })
    describe('Forking codependent services', function () {
      it('should connect to each other', function (done) {
        // This is what the dependency map should look like for the forked instances
        forkedDependencyMap = {
          CodependentDatabase1: ['CodependentDatabase2'],
          CodependentDatabase2: ['CodependentDatabase1']
        }
        // first fork Link, then master

        createForks('CodependentDatabase1', ['CodependentDatabase2'])
          .then(function (isolatedChildrenArray) {
            return IsolationService.updateDependenciesForIsolation(forked.CodependentDatabase1, isolatedChildrenArray)
          })
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (isolatedInstanceName) {
              return checkDependencies(
                forked[isolatedInstanceName],
                getDependencyInstances(forked, isolatedInstanceName)
              )
            })
          })
          .asCallback(done)
      })
    })
  })
})
