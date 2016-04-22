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
var error = require('error')

var Instance = require('models/mongo/instance')
var ContextVersion = require('models/mongo/context-version')
var mongoFactory = require('../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')

describe('Instance Model Integration Tests', function () {
  before(mongooseControl.start)
  var ctx
  beforeEach(function (done) {
    ctx = {}
    done()
  })
  afterEach(function (done) {
    Instance.remove({}, done)
  })
  after(function (done) {
    Instance.remove({}, done)
  })
  afterEach(function (done) {
    ContextVersion.remove({}, done)
  })
  after(function (done) {
    ContextVersion.remove({}, done)
  })
  after(mongooseControl.stop)

  describe('markAsStopping', function () {
    it('should not set container state to Stopping if container on instance has changed', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.save(function (err) {
        if (err) { throw err }
        // change model data in DB without going through model
        Instance.findOneAndUpdate({
          _id: instance._id
        }, {
          $set: {
            'container.dockerContainer': 'fooo'
          }
        }, function (err) {
          if (err) { throw err }
          Instance.markAsStopping(instance._id, instance.container.dockerContainer, function (err, result) {
            expect(err.message).to.equal('Instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })

    it('should not set container state to Stopping if container on instance is starting', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.save(function (err) {
        if (err) { throw err }
        // change model data in DB without going through model
        Instance.findOneAndUpdate({
          _id: instance._id
        }, {
          $set: {
            'container.inspect.State.Starting': 'true'
          }
        }, function (err) {
          if (err) { throw err }
          Instance.markAsStopping(instance._id, instance.container.dockerContainer, function (err, result) {
            expect(err.message).to.equal('Instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })
  })

  describe('markAsStarting', function () {
    it('should not set container state to Starting if container on instance has changed', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.save(function (err) {
        if (err) { throw err }
        // change model data in DB without going through model
        Instance.findOneAndUpdate({
          _id: instance._id
        }, {
          $set: {
            'container.dockerContainer': 'fooo'
          }
        }, function (err) {
          if (err) { throw err }
          Instance.markAsStarting(instance._id, instance.container.dockerContainer, function (err, result) {
            expect(err.message).to.equal('Instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })

    it('should not set container state to Starting if container on instance is starting', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.save(function (err) {
        if (err) { throw err }
        // change model data in DB without going through model
        Instance.findOneAndUpdate({
          _id: instance._id
        }, {
          $set: {
            'container.inspect.State.Stopping': 'true'
          }
        }, function (err) {
          if (err) { throw err }
          Instance.markAsStarting(instance._id, instance.container.dockerContainer, function (err, result) {
            expect(err.message).to.equal('Instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })
  })
  function createNewInstance (name, opts) {
    return function (done) {
      mongoFactory.createInstanceWithProps(ctx.mockSessionUser._id, opts, function (err, instance) {
        if (err) {
          return done(err)
        }
        ctx[name] = instance
        done(null, instance)
      })
    }
  }

  describe('setDependenciesFromEnvironment', function () {
    var ownerName = 'someowner'
    var instance
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
    afterEach(function (done) {
      instance.invalidateContainerDNS.restore()
      instance.getDependencies.restore()
      done()
    })

    describe('Testing changes in connections', function () {
      var masterInstances
      beforeEach(function (done) {
        masterInstances = [
          createNewInstance('hello', {masterPod: true}),
          createNewInstance('adelle', {masterPod: true})
        ]
        sinon.stub(instance, 'addDependency').yieldsAsync()
        sinon.stub(instance, 'removeDependency').yieldsAsync()
        done()
      })
      afterEach(function (done) {
        instance.addDependency.restore()
        instance.removeDependency.restore()
        done()
      })
      describe('Envs', function () {
        it('should add a new dep for each env, when starting with none', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
          instance.env = [
            'as=hello-staging-' + ownerName + '.runnableapp.com',
            'df=adelle-staging-' + ownerName + '.runnableapp.com'
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              'hello-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              'adelle-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [masterInstances[1]])
          instance.env = [
            'as=hello-staging-' + ownerName + '.runnableapp.com',
            'df=adelle-staging-' + ownerName + '.runnableapp.com'
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              'hello-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should remove one of the existing, but leave the other', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances)
          instance.env = [
            'df=adelle-staging-' + ownerName + '.runnableapp.com' // Keep masterInstance[1]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              sinon.match.func
            )
            sinon.assert.notCalled(instance.addDependency)
            done()
          })
        })
        it('should remove both of the existing', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances)
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              sinon.match.func
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.notCalled(instance.addDependency)
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [masterInstances[1]])
          instance.env = [
            'df=hello-staging-' + ownerName + '.runnableapp.com' // Add masterInstance[0]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.calledOnce(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              'hello-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {masterPod: true}))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {masterPod: true}))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {masterPod: true}))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {masterPod: true})) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.env = [
            'df=hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
            'asd=chicken-staging-' + ownerName + '.runnableapp.com', // add masterInstance[3]
            'asfgas=potatoes-staging-' + ownerName + '.runnableapp.com' // add masterInstance[5]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[2].shortHash),
              sinon.match.func
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[3].shortHash),
              'chicken-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[5].shortHash),
              'potatoes-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            done()
          })
        })
      })
      describe('FnR', function () {
        it('should add a new dep for each replace rule, when starting with none', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
          var firstAppCodeVersion = keypather.get(instance, 'contextVersion.appCodeVersions[0]')
          firstAppCodeVersion.transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com',
              exclude: []
            },
            {
              action: 'Replace',
              search: 'chicken',
              replace: 'adelle-staging-' + ownerName + '.runnableapp.com',
              exclude: []
            }
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              'hello-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              'adelle-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {masterPod: true}))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {masterPod: true}))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {masterPod: true}))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {masterPod: true})) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.contextVersion.appCodeVersions[0].transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
              exclude: []
            },
            {
              action: 'Replace',
              search: 'chicken',
              replace: 'chicken-staging-' + ownerName + '.runnableapp.com', // add masterInstance[3]
              exclude: []
            }
          ]
          instance.contextVersion.appCodeVersions[1].transformRules.replace = [
            {
              action: 'Replace',
              search: 'potatoes',
              replace: 'http://potatoes-staging-' + ownerName + '.runnableapp.com', // add masterInstance[5]
              exclude: []
            }
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[2].shortHash),
              sinon.match.func
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[3].shortHash),
              'chicken-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[5].shortHash),
              'potatoes-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            done()
          })
        })
      })
      describe('Working with both envs and FnR', function () {
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {masterPod: true}))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {masterPod: true}))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {masterPod: true}))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {masterPod: true})) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.contextVersion.appCodeVersions[0].transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
              exclude: []
            }
          ]
          instance.contextVersion.appCodeVersions[1].transformRules.replace = [
            {
              action: 'Replace',
              search: 'potatoes',
              replace: 'http://potatoes-staging-' + ownerName + '.runnableapp.com', // add masterInstance[5]
              exclude: []
            }
          ]
          instance.env = [
            'asd=chicken-staging-' + ownerName + '.runnableapp.com' // add masterInstance[3]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[2].shortHash),
              sinon.match.func
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[5].shortHash),
              'potatoes-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[3].shortHash),
              'chicken-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            done()
          })
        })
      })
    })
  })

  describe('PopulateModels', function () {
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        _id: 1234,
        findGithubUserByGithubId: sinon.stub().yieldsAsync(null, {
          login: 'TEST-login',
          avatar_url: 'TEST-avatar_url'
        }),
        accounts: {
          github: {
            id: 1234
          }
        }
      }
      done()
    })
    beforeEach(function (done) {
      // Both of the cvs that are saved to the instance have their build.completed removed
      // so that they are different after the update
      mongoFactory.createCompletedCv(ctx.mockSessionUser._id, function (err, cv) {
        if (err) {
          return done(err)
        }
        ctx.cv = cv
        mongoFactory.createBuild(ctx.mockSessionUser._id, ctx.cv, function (err, build) {
          if (err) {
            return done(err)
          }
          ctx.build = build
          var tempCv = ctx.cv
          // Delete completed so the cv in the instance is 'out of date'
          delete tempCv._doc.build.completed
          mongoFactory.createInstance(ctx.mockSessionUser._id, ctx.build, false, tempCv, function (err, instance) {
            if (err) {
              return done(err)
            }
            ctx.instance = instance
            done()
          })
        })
      })
    })
    beforeEach(function (done) {
      mongoFactory.createCompletedCv(ctx.mockSessionUser._id, function (err, cv) {
        if (err) {
          return done(err)
        }
        ctx.cv2 = cv
        mongoFactory.createBuild(ctx.mockSessionUser._id, ctx.cv2, function (err, build) {
          if (err) {
            return done(err)
          }
          ctx.build2 = build
          var tempCv = ctx.cv2
          delete tempCv._doc.build.completed
          mongoFactory.createInstance(ctx.mockSessionUser._id, ctx.build2, false, tempCv, function (err, instance) {
            if (err) {
              return done(err)
            }
            ctx.instance2 = instance
            done()
          })
        })
      })
    })
    beforeEach(function (done) {
      ctx.instances = [ctx.instance, ctx.instance2]
      done()
    })

    describe('when instances are not all populated', function () {
      it('should fetch build and cv, then update the cv', function (done) {
        Instance.populateModels(ctx.instances, function (err, instances) {
          if (err) {
            return done(err)
          }
          expect(err).to.not.exist()
          expect(instances[0]._id, 'instance._id').to.deep.equal(ctx.instance._id)
          expect(instances[0].contextVersion, 'cv').to.be.object()
          expect(instances[0].build, 'build').to.be.object()
          expect(instances[0].contextVersion._id, 'cv._id').to.deep.equal(ctx.cv._id)
          expect(instances[0].build._id, 'build._id').to.deep.equal(ctx.build._id)

          expect(instances[1]._id, 'instance 2').to.deep.equal(ctx.instance2._id)
          expect(instances[1].contextVersion, 'cv2').to.be.object()
          expect(instances[1].build, 'build2').to.be.object()
          expect(instances[1].contextVersion._id, 'cv2._id').to.deep.equal(ctx.cv2._id)
          expect(instances[1].build._id, 'build2._id').to.deep.equal(ctx.build2._id)
          done()
        })
      })
    })

    describe('when errors happen', function () {
      beforeEach(function (done) {
        sinon.spy(error, 'log')
        done()
      })
      afterEach(function (done) {
        error.log.restore()
        done()
      })

      describe('when an instance is missing its container Inspect', function () {
        it('should report the bad instance and keep going', function (done) {
          ctx.instance2.container = {
            dockerContainer: 'asdasdasd'
          }

          Instance.populateModels(ctx.instances, function (err, instances) {
            if (err) {
              done(err)
            }
            expect(err).to.not.exist()
            sinon.assert.calledOnce(error.log)
            sinon.assert.calledWith(
              error.log,
              sinon.match.has('message', 'instance missing inspect data' + ctx.instance2._id)
            )

            expect(instances.length, 'instances length').to.equal(2)
            expect(instances[0]._id, 'instance._id').to.deep.equal(ctx.instance._id)
            expect(instances[0].contextVersion, 'cv').to.be.object()
            expect(instances[0].build, 'build').to.be.object()
            expect(instances[0].contextVersion._id, 'cv._id').to.deep.equal(ctx.cv._id)
            expect(instances[0].build._id, 'build._id').to.deep.equal(ctx.build._id)

            expect(instances[1]._id, 'instance 2').to.deep.equal(ctx.instance2._id)
            expect(instances[1].contextVersion, 'cv2').to.be.object()
            expect(instances[1].build, 'build2').to.be.object()
            expect(instances[1].contextVersion._id, 'cv2._id').to.deep.equal(ctx.cv2._id)
            expect(instances[1].build._id, 'build2._id').to.deep.equal(ctx.build2._id)
            done()
          })
        })
      })
      describe('when a failure happens during a db query', function () {
        describe('CV.find', function () {
          it('should return error', function (done) {
            // This should cause a casting error
            ctx.instance._doc.contextVersion = {
              _id: 'asdasdasd'
            }
            Instance.populateModels(ctx.instances, function (err) {
              expect(err).to.exist()
              done()
            })
          })
        })
        describe('Build.find', function () {
          it('should return error', function (done) {
            // This should cause a casting error
            ctx.instance._doc.build = 'asdasdasd'
            Instance.populateModels(ctx.instances, function (err) {
              expect(err).to.exist()
              done()
            })
          })
        })
      })
    })
  })
})
