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
var error = require('error')
var expect = Code.expect
var sinon = require('sinon')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var mongoFactory = require('../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')

describe('Instance Services Integration Tests', function () {
  before(mongooseControl.start)
  beforeEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  after(mongooseControl.stop)

  describe('.createInstance', function () {
    var ctx = {}
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'instanceDeployed')
      sinon.stub(rabbitMQ, 'createInstanceContainer')
      sinon.stub(InstanceService, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      rabbitMQ.instanceDeployed.restore()
      rabbitMQ.createInstanceContainer.restore()
      InstanceService.emitInstanceUpdate.restore()
      done()
    })
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        findGithubUserByGithubIdAsync: sinon.spy(function (id) {
          var login = (id === ctx.mockSessionUser.accounts.github.id) ? 'user' : 'owner'
          return Promise.resolve({
            login: login,
            avatar_url: 'TEST-avatar_url'
          })
        }),
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: 1234,
            username: 'user'
          }
        }
      }
      ctx.ownerId = 11111
      ctx.mockOwner = {
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: ctx.ownerId,
            username: 'owner'
          }
        }
      }
      done()
    })
    describe('create new instance', function () {
      beforeEach(function (done) {
        mongoFactory.createInstanceWithProps(ctx.mockOwner, {
          masterPod: true
        }, function (err, instance, build, cv) {
          if (err) {
            return done(err)
          }
          ctx.otherInstance = instance
          ctx.otherBuild = build
          ctx.otherCv = cv
          done()
        })
      })
      beforeEach(function (done) {
        mongoFactory.createCompletedCv(1234, function (err, cv) {
          if (err) {
            return done(err)
          }
          ctx.completedCv = cv
          done()
        })
      })
      beforeEach(function (done) {
        mongoFactory.createBuild(1234, ctx.completedCv, function (err, build) {
          if (err) {
            return done(err)
          }
          ctx.build = build
          done()
        })
      })
      it('should create an instance, create a connection, and fire both Rabbit events', function (done) {
        var body = {
          name: 'asdasdasd',
          env: ['safdsdf=' + ctx.otherInstance.getElasticHostname('owner')],
          build: ctx.build._id.toString(),
          masterPod: true,
          owner: {
            github: ctx.ownerId
          }
        }
        InstanceService.createInstance(body, ctx.mockSessionUser)
          .then(function (instance) {
            expect(instance).to.exist()
            return Instance.findByIdAsync(instance._id)
          })
          .then(function (instance) {
            expect(instance).to.exist()
            var jsoned = instance.toJSON()
            // -----
            expect(jsoned).to.include({
              createdBy: {
                github: 1234,
                gravatar: 'sdasdasdasdasdasd',
                username: 'user'
              },
              owner: {
                github: ctx.ownerId,
                gravatar: 'TEST-avatar_url',
                username: 'owner'
              }
            })
            expect(jsoned).to.include({
              build: ctx.build._id,
              name: body.name,
              lowerName: body.name.toLowerCase(),
              env: body.env
            })
            expect(instance.elasticHostname).to.exist()
            expect(instance.contextVersion._id).to.equal(ctx.completedCv._id)
            // -----
            sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
              cvId: ctx.completedCv._id.toString(),
              instanceId: instance._id.toString()
            })
            sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
              contextVersionId: ctx.completedCv._id.toString(),
              instanceId: instance._id.toString(),
              ownerUsername: 'owner',
              sessionUserGithubId: 1234
            })
            sinon.assert.calledWith(
              InstanceService.emitInstanceUpdate,
              sinon.match.has('_id', instance._id),
              sinon.match.number,
              'post'
            )
            return instance.getDependenciesAsync()
          })
          .then(function (deps) {
            expect(deps.length).to.equal(1)
          })
          .asCallback(done)
      })
    })
  })

  describe('.updateInstance', function () {
    var ctx = {}
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'instanceDeployed')
      sinon.stub(rabbitMQ, 'createInstanceContainer')
      sinon.stub(rabbitMQ, 'deleteContextVersion')
      sinon.stub(InstanceService, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      rabbitMQ.instanceDeployed.restore()
      rabbitMQ.createInstanceContainer.restore()
      rabbitMQ.deleteContextVersion.restore()
      InstanceService.emitInstanceUpdate.restore()
      done()
    })
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        findGithubUserByGithubId: sinon.spy(function (id, cb) {
          var login = (id === ctx.mockSessionUser.accounts.github.id) ? 'user' : 'owner'
          return cb(null, {
            login: login,
            avatar_url: 'sdasdasdasdasdasd'
          })
        }),
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: 1234,
            username: 'user'
          }
        }
      }
      ctx.ownerId = 11111
      ctx.mockOwner = {
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: ctx.ownerId,
            username: 'owner'
          }
        }
      }
      done()
    })
    describe('update instance with new build', function () {
      beforeEach(function (done) {
        mongoFactory.createInstanceWithProps(ctx.mockOwner, {
          masterPod: true
        }, function (err, instance, build, cv) {
          if (err) {
            return done(err)
          }
          ctx.instance = instance
          ctx.otherBuild = build
          ctx.otherCv = cv
          done()
        })
      })
      beforeEach(function (done) {
        mongoFactory.createCompletedCv(ctx.ownerId, function (err, cv) {
          if (err) {
            return done(err)
          }
          ctx.completedCv = cv
          done()
        })
      })
      beforeEach(function (done) {
        mongoFactory.createBuild(ctx.ownerId, ctx.completedCv, function (err, build) {
          if (err) {
            return done(err)
          }
          ctx.build = build
          done()
        })
      })
      it('should update the instance, create a new container, delete the contextVersion, and emit an update', function (done) {
        var body = {
          env: ['safdsdf=sadasdas'],
          build: ctx.build._id.toString()
        }
        InstanceService.updateInstance(ctx.instance, body, ctx.mockSessionUser)
          .then(function (instance) {
            expect(instance).to.exist()
            return Instance.findByIdAsync(instance._id)
          })
          .then(function (instance) {
            expect(instance).to.exist()
            var jsoned = instance.toJSON()

            expect(jsoned).to.include({
              build: ctx.build._id,
              env: body.env,
              contextVersion: ctx.completedCv.toJSON()
            })
            expect(instance.elasticHostname).to.exist()
            expect(instance.contextVersion._id).to.equal(ctx.completedCv._id)
            // -----
            sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
              cvId: ctx.completedCv._id.toString(),
              instanceId: instance._id.toString()
            })
            sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
              contextVersionId: ctx.completedCv._id.toString(),
              instanceId: instance._id.toString(),
              ownerUsername: 'owner',
              sessionUserGithubId: 1234
            })
            sinon.assert.calledWith(rabbitMQ.deleteContextVersion, {
              contextVersionId: ctx.otherCv._id.toString()
            })
            sinon.assert.calledWith(
              InstanceService.emitInstanceUpdate,
              sinon.match.has('_id', instance._id),
              sinon.match.number,
              'post'
            )
            return instance.getDependenciesAsync()
          })
          .then(function (deps) {
            expect(deps.length).to.equal(0)
          })
          .asCallback(done)
      })
    })
  })
  describe('PopulateModels', function () {
    var ctx = {}
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
             ctx.mockSessionUser.bigPoppaUser = {
               organizations: [
                 {
                   githubId: instance.owner.github
                 }
               ]
             }
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
       it('should fetch build and cv, then update the cv', function () {
         return InstanceService.populateModels(ctx.instances, ctx.mockSessionUser)
           .then(instances => {
             expect(instances[0]._id, 'instance._id').to.equal(ctx.instance._id)
             expect(instances[0].contextVersion, 'cv').to.be.object()
             expect(instances[0].build, 'build').to.be.object()
             expect(instances[0].contextVersion._id, 'cv._id').to.equal(ctx.cv._id)
             expect(instances[0].build._id, 'build._id').to.equal(ctx.build._id)

             expect(instances[1]._id, 'instance 2').to.equal(ctx.instance2._id)
             expect(instances[1].contextVersion, 'cv2').to.be.object()
             expect(instances[1].build, 'build2').to.be.object()
             expect(instances[1].contextVersion._id, 'cv2._id').to.equal(ctx.cv2._id)
             expect(instances[1].build._id, 'build2._id').to.equal(ctx.build2._id)
           })
       })
     })

     describe('when errors happen', function () {
       beforeEach(function (done) {
         sinon.stub(error, 'log')
         done()
       })
       afterEach(function (done) {
         error.log.restore()
         done()
       })

       describe('when an instance is missing its container Inspect', function () {
         it('should report the bad instance and keep going', function () {
           ctx.instance2.container = {
             dockerContainer: 'asdasdasd'
           }

           return InstanceService.populateModels(ctx.instances, ctx.mockSessionUser)
             .then(instances => {
               sinon.assert.calledOnce(error.log)
               sinon.assert.calledWith(
                 error.log,
                 sinon.match.has('message', 'instance missing inspect data' + ctx.instance2._id)
               )

               expect(instances.length, 'instances length').to.equal(2)
               expect(instances[0]._id, 'instance._id').to.equal(ctx.instance._id)
               expect(instances[0].contextVersion, 'cv').to.be.object()
               expect(instances[0].build, 'build').to.be.object()
               expect(instances[0].contextVersion._id, 'cv._id').to.equal(ctx.cv._id)
               expect(instances[0].build._id, 'build._id').to.equal(ctx.build._id)

               expect(instances[1]._id, 'instance 2').to.equal(ctx.instance2._id)
               expect(instances[1].contextVersion, 'cv2').to.be.object()
               expect(instances[1].build, 'build2').to.be.object()
               expect(instances[1].contextVersion._id, 'cv2._id').to.equal(ctx.cv2._id)
               expect(instances[1].build._id, 'build2._id').to.equal(ctx.build2._id)
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
             InstanceService.populateModels(ctx.instances, ctx.mockSessionUser)
               .asCallback(err => {
                 expect(err).to.exist()
                 done()
               })
           })
         })
         describe('Build.find', function () {
           it('should return error', function (done) {
             // This should cause a casting error
             ctx.instance._doc.build = 'asdasdasd'
             InstanceService.populateModels(ctx.instances, ctx.mockSessionUser)
               .asCallback(err => {
                 expect(err).to.exist()
                 done()
               })
           })
         })
       })
     })
   })
})
