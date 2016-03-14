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
  function createNewInstance(name, isolated) {
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
        return dependents.every(function (child) {
          var fixedChildName = child.name
          return nodeNameArray.indexOf(fixedChildName) > -1
        })
      })
      .then(function (depenciesWorked) {
        if (!depenciesWorked) {
          throw new Error('The dependencies were all wrong!', depenciesWorked)
        }
      })
  }

  describe('_updateDependenciesForInstanceWithChildren', function () {
    var dependencyMap = {}
    beforeEach(createNewInstance('Frontend'))
    beforeEach(createNewInstance('Api'))
    beforeEach(createNewInstance('Link'))
    beforeEach(createNewInstance('RabbitMQ'))
    beforeEach(createNewInstance('MongoDB'))
    //beforeEach(function (done) {
    //  sinon.stub(ctx.frontend, 'getElasticHostname').returns(ctx.frontend.shortHash + '-runnable-angular-staging-codenow.runnableapp.com')
    //  sinon.stub(ctx.api, 'getElasticHostname').returns(ctx.api.shortHash + '-api-staging-codenow.runnableapp.com')
    //  sinon.stub(ctx.link, 'getElasticHostname').returns(ctx.link.shortHash + '-link-staging-codenow.runnableapp.com')
    //  sinon.stub(ctx.rabbitMq, 'getElasticHostname').returns('rabbitmq-staging-codenow.runnableapp.com')
    //  sinon.stub(ctx.mongoDb, 'getElasticHostname').returns('mongodb-staging-codenow.runnableapp.com')
    //  done()
    //})
    beforeEach(function (done) {
      dependencyMap = {
        Frontend: [ctx.Api],
        Api: [ctx.MongoDB, ctx.Link],
        Link: [ctx.MongoDB, ctx.RabbitMQ]
      }
      //dependencyMap = {
      //  Api: [ctx.Frontend],
      //  Link: [ctx.Api],
      //  RabbitMQ: [ctx.Link],
      //  MongoDB: [ctx.Api, ctx.Link]
      //}
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
        return makeDependecies(ctx[instanceName], dependencyMap[instanceName])
      })
      .asCallback(done)
    })
    beforeEach(function (done) {
      Promise.each(Object.keys(dependencyMap), function (instanceName) {
        return checkDependencies(ctx[instanceName], dependencyMap[instanceName])
      })
      .asCallback(done)
    })
    describe('Master\'s dependecies', function () {
      var forked = {}
      beforeEach(function (done) {
        createNewInstance(ctx.Frontend.shortHash + '--Api', 'asdasdasdas')(function (err, api) {
          forked.Api = api
          sinon.stub(forked.Api, 'getMainBranchName').returns('branch1')
          done()
        })
      })
      beforeEach(function (done) {
        createNewInstance(ctx.Frontend.shortHash + '--Link', 'asdasdasdas')(function (err, link) {
          forked.Link = link
          sinon.stub(forked.Link, 'getMainBranchName').returns('branch1')
          createNewInstance(ctx.Frontend.shortHash + '--MongoDB', 'asdasdasdas')(function (err, mongoDB) {
            forked.MongoDB = mongoDB
            sinon.stub(forked.MongoDB, 'getMainBranchName').returns('branch1')
            done()
          })
        })
      })
      it('should handle when the master does not depend on any of the included isolated children', function (done) {
        // first fork Link, then master
        IsolationService._updateDependenciesForInstanceWithChildren(ctx.Frontend, [forked.Api])
          .then(function () {

          })
          .asCallback(done)
      })
      it('should handle a lot of isolation', function (done) {
        // first fork Link, then master
        IsolationService._updateDependenciesForInstanceWithChildren(ctx.Frontend, [forked.Api, forked.Link, forked.MongoDB])
          .then(function () {

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
