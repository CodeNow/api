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
var error = require('error')

var Instance = require('models/mongo/instance')
var mongoFactory = require('../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')

describe('Instance Model Integration Tests', function () {
  before(mongooseControl.start)
  var ctx
  beforeEach(function (done) {
    ctx = {}
    done()
  })

  beforeEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
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
  function createExpectedConnection (opts) {
    var name = opts.name
    var parentName = opts.parentName || name
    var dep = {
      'shortHash': ctx[name].shortHash,
      'lowerName': name.toLowerCase(),
      'name': name,
      'id': ctx[name]._id.toString(),
      'hostname': parentName.toLowerCase() + '-staging-someowner.runnableapp.com',
      'owner': {
        'github': 1234
      },
      'contextVersion': {
        'context': ctx[name].contextVersion.context.toString()
      },

      'network': {
        'hostIp': '127.0.0.1'
      }
    }
    if (opts.isIsolationGroupMaster) {
      dep.isIsolationGroupMaster = opts.isIsolationGroupMaster
    }
    if (opts.isolated) {
      dep.isolated = opts.isolated
    }
    return dep
  }

  describe('setDependenciesFromEnvironment', function () {
    var ownerName = 'someowner'
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
      ctx.deps = {}
      done()
    })

    describe('Testing changes in connections', function () {
      beforeEach(createNewInstance('hello', {
        name: 'hello',
        masterPod: true,
        env: [
          'df=adelle-staging-' + ownerName + '.runnableapp.com'
        ]
      }))
      beforeEach(createNewInstance('adelle', {
        name: 'adelle',
        masterPod: true
      }))
      beforeEach(createNewInstance('goodbye', {
        name: 'goodbye',
        masterPod: true
      }))
      describe('Masters', function () {
        beforeEach(function (done) {
          ctx.hello.setDependenciesFromEnvironment(ownerName, done)
        })
        it('should add a new dep for each env, when starting with none', function (done) {
          ctx.hello.getDependencies(function (err, dependencies) {
            expect(dependencies).to.be.array()
            expect(dependencies.length).to.equal(1)
            var expected = createExpectedConnection({name: 'adelle'})
            expect(dependencies[0]).to.deep.equal(expected)
            done(err)
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          ctx.hello.env.push([
            'as=goodbye-staging-' + ownerName + '.runnableapp.com'
          ])
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(2)
              var expected0 = createExpectedConnection({name: 'goodbye'})
              var expected1 = createExpectedConnection({name: 'adelle'})
              expect(dependencies[0]).to.deep.equal(expected0)
              expect(dependencies[1]).to.deep.equal(expected1)
              done(err)
            })
          })
        })
        it('should remove the only dependency', function (done) {
          ctx.hello.env = []
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(0)
              done(err)
            })
          })
        })
      })
      describe('connecting to branches', function () {
        beforeEach(function (done) {
          createNewInstance('fb1-adelle', {
            name: 'fb1-adelle',
            masterPod: false,
            cv: ctx.adelle.contextVersion
          })(done)
        })
        beforeEach(function (done) {
          createNewInstance('fb1-goodbye', {
            name: 'fb1-goodbye',
            masterPod: false,
            cv: ctx.goodbye.contextVersion
          })(done)
        })
        beforeEach(function (done) {
          // Set the dep to a branch
          ctx.hello.addDependency(ctx['fb1-adelle'], 'adelle-staging-' + ownerName + '.runnableapp.com', done)
        })
        it('should add a new dep for each env, when starting with none', function (done) {
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(1)
              var expected = createExpectedConnection({name: 'fb1-adelle', parentName: 'adelle'})
              expect(dependencies[0]).to.deep.equal(expected)
              done(err)
            })
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          ctx.hello.env.push([
            'as=goodbye-staging-' + ownerName + '.runnableapp.com'
          ])
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(2)
              var expected0 = createExpectedConnection({name: 'goodbye'})
              var expected1 = createExpectedConnection({name: 'fb1-adelle', parentName: 'adelle'})
              expect(dependencies[0]).to.deep.equal(expected0)
              expect(dependencies[1]).to.deep.equal(expected1)
              done(err)
            })
          })
        })
        it('should remove the only dependency', function (done) {
          ctx.hello.env = []
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(0)
              done(err)
            })
          })
        })
      })

      describe('being isolated', function () {
        beforeEach(function (done) {
          createNewInstance('fb1-hello', {
            name: 'fb1-hello',
            masterPod: false,
            env: [
              'df=goodbye-staging-' + ownerName + '.runnableapp.com'
            ],
            cv: ctx.hello.contextVersion
          })(function () {
            Instance.findOneAndUpdate({
              _id: ctx['fb1-hello']._id
            }, {
              $set: {
                isolated: ctx['fb1-hello']._id,
                isIsolationGroupMaster: true
              }
            }, function (err, instance) {
              ctx['fb1-hello'] = instance
              done(err)
            })
          })
        })
        beforeEach(function (done) {
          createNewInstance('fb1-adelle', {
            name: 'fb1-adelle',
            masterPod: false,
            cv: ctx.adelle.contextVersion
          })(done)
        })

        var fb1GoodbyeName = null

        beforeEach(function (done) {
          fb1GoodbyeName = ctx['fb1-hello'].shortHash + '--goodbye'
          createNewInstance(fb1GoodbyeName, {
            name: fb1GoodbyeName,
            masterPod: false,
            isolated: ctx['fb1-hello']._id,
            cv: ctx.goodbye.contextVersion
          })(done)
        })
        beforeEach(function (done) {
          ctx['fb1-hello'].setDependenciesFromEnvironment(ownerName, done)
        })
        it('should add the isolated branch as the dep from the start', function (done) {
          ctx['fb1-hello'].getDependencies(function (err, dependencies) {
            if (err) {
              return done(err)
            }
            expect(dependencies).to.be.array()
            expect(dependencies.length).to.equal(1)
            var expected = createExpectedConnection({
              name: fb1GoodbyeName,
              parentName: 'goodbye',
              isolated: ctx['fb1-hello']._id.toString()
            })
            Object.keys(dependencies[0]).forEach(function (key) {
              console.log('key: ', key, 'expected', expected[key], 'actual', dependencies[0][key])

              expect(dependencies[0][key], key).to.deep.equal(expected[key])
            })
            expect(dependencies[0]).to.deep.equal(expected)
            done()
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          ctx['fb1-hello'].env.push([
            'as=adelle-staging-' + ownerName + '.runnableapp.com'
          ])
          ctx['fb1-hello'].setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx['fb1-hello'].getDependencies(function (err, dependencies) {
              if (err) {
                return done(err)
              }
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(2)
              var expected1 = createExpectedConnection({
                name: fb1GoodbyeName,
                parentName: 'goodbye',
                isolated: ctx['fb1-hello']._id.toString()
              })
              var expected0 = createExpectedConnection({name: 'adelle'})
              expect(dependencies[0]).to.deep.equal(expected0)
              expect(dependencies[1]).to.deep.equal(expected1)
              done()
            })
          })
        })
        it('should remove the only dependency', function (done) {
          ctx['fb1-hello'].env = []
          ctx['fb1-hello'].setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx['fb1-hello'].getDependencies(function (err, dependencies) {
              if (err) {
                return done(err)
              }
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(0)
              done()
            })
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
