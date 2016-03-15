'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')
var Promise = require('bluebird')
var pluck = require('101/pluck')
var noop = require('101/noop')

var async = require('async')
var error = require('error')

var Instance = require('models/mongo/instance')
var ContextVersion = require('models/mongo/context-version')
var mongoFactory = require('../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')
var IsolationService = require('models/services/isolation-service.js')
require('sinon-as-promised')(require('bluebird'))

describe('Instance Services Integration Tests', function () {
  before(mongooseControl.start)
  var ctx
  beforeEach(function (done) {
    ctx = {}
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
  function createNewInstance (name, isolated) {
    return function (done) {
      mongoFactory.createInstanceWithProps(ctx.mockSessionUser._id, {
        name: name,
        username: ctx.mockUsername,
        isolated: isolated
      }, function (err, instance, build, cv) {
        if (err) {
          return done(err)
        }
        ctx[name] = instance
        done(null, instance)
      })
    }
  }
  var createNewInstanceAsync = function (name, isolated) {
    return Promise.fromCallback(function (cb) {
      createNewInstance(name, isolated)(cb)
    })
  }
  beforeEach(createNewInstance('Frontend'))
  beforeEach(createNewInstance('Api'))
  beforeEach(createNewInstance('Link'))
  beforeEach(createNewInstance('RabbitMQ'))
  beforeEach(createNewInstance('MongoDB'))
  beforeEach(function (done) {
    sinon.stub(ctx.Frontend, 'getMainBranchName').returns('master')
    sinon.stub(ctx.Api, 'getMainBranchName').returns('master')
    sinon.stub(ctx.Link, 'getMainBranchName').returns('master')
    sinon.stub(ctx.RabbitMQ, 'getMainBranchName').returns('master')
    sinon.stub(ctx.MongoDB, 'getMainBranchName').returns('master')
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
    Link: ['MongoDB', 'RabbitMQ']
  }

  /**
   * Gets the actual dependency instances linked to a master
   * @param from {Object} ctx of forked
   * @param master
   * @returns {*}
   */
  function getDependencyInstances(from, master) {
    return dependencyMap[master].map(function (depName) {
      return from[depName] || ctx[depName]
    })
  }

  function makeDependecies(master, dependents) {
    return Promise.each(dependents, function (dependentInstance) {
      return master.addDependencyAsync(
        dependentInstance,
        dependentInstance.getElasticHostname(ctx.mockUsername)
      )
    })
  }
  function checkDependencies(master, dependents) {
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
          throw new Error('The dependencies for ' + master.name + ' were all wrong!' +
            JSON.stringify(missingDependencies.map(pluck('name')))
          )
        }
      })
  }

  describe('_updateDependenciesForInstanceWithChildren', function () {
    describe('Master\'s dependecies', function () {
      var toFork = ['Api', 'Link', 'MongoDB']
      var forked = {}
      beforeEach(function (done) {
        Promise.each(toFork, function (instanceName) {
          return createNewInstanceAsync(ctx.Frontend.shortHash + '--' + instanceName, 'asdasdasdas')
            .then(function (instanceModel) {
              forked[instanceName] = instanceModel
              sinon.stub(instanceModel, 'getMainBranchName').returns('branch1')
            })
        })
          .asCallback(done)
      })
      it('should ', function (done) {
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
      it('should handle a lot of isolation', function (done) {
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
    //describe('Has Dependencies, but not of the master', function () {
    //  var forkedLink = null
    //  beforeEach(function (done) {
    //    createNewInstance(ctx.Frontend.shortHash + '--Link')(function (err, link) {
    //      forkedLink = link
    //      sinon.stub(forkedLink, 'getMainBranchName').returns('branch1')
    //      done()
    //    })
    //  })
    //  it('should handle when the master does not depend on any of the included isolated children', function (done) {
    //    // first fork Link, then master
    //
    //    IsolationService._updateDependenciesForInstanceWithChildren(ctx.Frontend, [forkedLink])
    //      .then(function () {
    //
    //      })
    //      .asCallback(done)
    //  })
    //})
  })
  describe('updateDependenciesForIsolation', function () {
    describe('Master\'s dependecies', function () {
      var forked = {}
      var forkedDependencyMap = {}
      var instanceNameArray = ['Frontend', 'Api', 'Link', 'RabbitMQ', 'MongoDB']
      beforeEach(function (done) {
        // Fork Frontend
        return Promise.each(instanceNameArray, function (instanceName) {
          var doubleDashes = instanceName === 'Frontend' ? '-' : '--'
          return createNewInstanceAsync(ctx.Frontend.shortHash + doubleDashes + instanceName, 'asdasdasdas')
            .then(function (instanceModel) {
              forked[instanceName] = instanceModel
              sinon.stub(instanceModel, 'getMainBranchName').returns('branch1')
            })
          })
          .asCallback(done)
      })
      beforeEach(function connectAllForkedDepsToOrginalUnforked (done) {
        // This emulates when each of these instances get configured from their envs
        Promise.each(Object.keys(dependencyMap), function (instanceName) {
          // It should take these newly forked instances, and bind them to the original master
          // (ctx) branches.
          return makeDependecies(forked[instanceName], getDependencyInstances(ctx, instanceName))
        })
        .asCallback(done)
      })
      it('should connect Frontend to the new Api server', function (done) {
        forkedDependencyMap = {
          Frontend: ['Api']
        }
        var forkedInstances = ['Frontend', ]
        var isolatedChildren = [forked.Api, forked.Link, forked.RabbitMQ]
        IsolationService.updateDependenciesForIsolation(forked.Frontend, [forked.Api])
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
            return checkDependencies(forked.Api, getDependencyInstances(ctx, 'Api'))
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
        var isolatedChildren = [forked.Api, forked.Link, forked.RabbitMQ]
        // first fork Link, then master
        IsolationService.updateDependenciesForIsolation(forked.Frontend, isolatedChildren)
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (instanceName) {
              return checkDependencies(forked[instanceName], getDependencyInstances(forked, instanceName))
            })
          })
          .asCallback(done)
      })
      it('should connect links not connected to the isolation master', function (done) {
        forkedDependencyMap = {
          Frontend: [/* Empty, since api isn't getting forked */],
          Link: ['RabbitMQ']
        }
        // first fork Link, then master
        IsolationService.updateDependenciesForIsolation(forked.Frontend, [forked.Link, forked.RabbitMQ])
          .then(function () {
            // Make sure the original mappings are still intact
            return Promise.each(Object.keys(dependencyMap), function (instanceName) {
              return checkDependencies(ctx[instanceName], getDependencyInstances(ctx, instanceName))
            })
          })
          .then(function () {
            return Promise.each(Object.keys(forkedDependencyMap), function (instanceName) {
              return checkDependencies(forked[instanceName], getDependencyInstances(forked, instanceName))
            })
          })
          .asCallback(done)
      })
    })
    //describe('Has Dependencies, but not of the master', function () {
    //  var forkedLink = null
    //  beforeEach(function (done) {
    //    createNewInstance(ctx.Frontend.shortHash + '--Link')(function (err, link) {
    //      forkedLink = link
    //      sinon.stub(forkedLink, 'getMainBranchName').returns('branch1')
    //      done()
    //    })
    //  })
    //  it('should handle when the master does not depend on any of the included isolated children', function (done) {
    //    // first fork Link, then master
    //
    //    IsolationService._updateDependenciesForInstanceWithChildren(ctx.Frontend, [forkedLink])
    //      .then(function () {
    //
    //      })
    //      .asCallback(done)
    //  })
    //})
  })
})
