'use strict'
require('loadenv')()

require('sinon-as-promised')(require('bluebird'))
var Code = require('code')
var createCount = require('callback-count')
var lab = exports.lab = require('lab').script()
var path = require('path')
var sinon = require('sinon')

var errorModule = require('error')
var GitHub = require('models/apis/github')
var Messenger = require('socket/messenger')
var rabbitMQ = require('models/rabbitmq')
var User = require('models/mongo/user')

var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var expect = Code.expect
var moduleName = path.relative(process.cwd(), __filename)

describe('Messenger: ' + moduleName, function () {
  describe('emitInstanceUpdate', function () {
    beforeEach(function (done) {
      sinon.stub(Messenger, 'messageRoom')
      sinon.stub(rabbitMQ, 'instanceDeleted')
      sinon.stub(rabbitMQ, 'instanceCreated')
      sinon.stub(rabbitMQ, 'instanceUpdated')
      done()
    })
    afterEach(function (done) {
      Messenger.messageRoom.restore()
      rabbitMQ.instanceDeleted.restore()
      rabbitMQ.instanceCreated.restore()
      rabbitMQ.instanceUpdated.restore()
      done()
    })

    it('should throw error if missing instance', function (done) {
      expect(function () {
        Messenger._emitInstanceUpdateAction()
      }).to.throw(Error, 'emitInstanceUpdate missing instance')
      done()
    })

    it('should send instance update to room', function (done) {
      var testInstance = {
        owner: {
          github: 'test'
        }
      }
      Messenger._emitInstanceUpdateAction(testInstance, 'jump')

      sinon.assert.calledOnce(Messenger.messageRoom)
      sinon.assert.calledWith(Messenger.messageRoom, 'org', 'test', {
        event: 'INSTANCE_UPDATE',
        action: 'jump',
        data: testInstance
      })
      done()
    })

    it('should call instanceDeleted if delete event', function (done) {
      var testInstance = {
        owner: {
          github: 'test'
        }
      }
      Messenger._emitInstanceUpdateAction(testInstance, 'delete')

      sinon.assert.calledOnce(rabbitMQ.instanceDeleted)
      sinon.assert.calledWith(rabbitMQ.instanceDeleted, {
        action: 'delete',
        instance: testInstance,
        timestamp: sinon.match.number
      })

      sinon.assert.notCalled(rabbitMQ.instanceCreated)
      sinon.assert.notCalled(rabbitMQ.instanceUpdated)

      done()
    })

    it('should call instanceCreated if post event', function (done) {
      var testInstance = {
        owner: {
          github: 'test'
        }
      }
      Messenger._emitInstanceUpdateAction(testInstance, 'post')

      sinon.assert.calledOnce(rabbitMQ.instanceCreated)
      sinon.assert.calledWith(rabbitMQ.instanceCreated, {
        action: 'post',
        instance: testInstance,
        timestamp: sinon.match.number
      })

      sinon.assert.notCalled(rabbitMQ.instanceDeleted)
      sinon.assert.notCalled(rabbitMQ.instanceUpdated)

      done()
    })

    it('should call instanceUpdated', function (done) {
      var testInstance = {
        owner: {
          github: 'test'
        }
      }
      Messenger._emitInstanceUpdateAction(testInstance, 'jump')

      sinon.assert.calledOnce(rabbitMQ.instanceUpdated)
      sinon.assert.calledWith(rabbitMQ.instanceUpdated, {
        action: 'jump',
        instance: testInstance,
        timestamp: sinon.match.number
      })

      sinon.assert.notCalled(rabbitMQ.instanceDeleted)
      sinon.assert.notCalled(rabbitMQ.instanceCreated)

      done()
    })
  })

  describe('emitInstanceUpdate', function () {
    beforeEach(function (done) {
      sinon.stub(Messenger, '_emitInstanceUpdateAction')
      sinon.stub(errorModule, 'log')
      done()
    })
    afterEach(function (done) {
      Messenger._emitInstanceUpdateAction.restore()
      errorModule.log.restore()
      done()
    })
    it('should throw if instance is null', function (done) {
      try {
        Messenger.emitInstanceUpdate(null, 'update')
        done(new Error('Should never happen'))
      } catch (err) {
        expect(err.message).to.equal('emitInstanceUpdate missing instance or action')
        sinon.assert.notCalled(Messenger._emitInstanceUpdateAction)
        done()
      }
    })
    it('should throw if action is null', function (done) {
      try {
        Messenger.emitInstanceUpdate({ _id: 'some-id' }, null)
        done(new Error('Should never happen'))
      } catch (err) {
        expect(err.message).to.equal('emitInstanceUpdate missing instance or action')
        sinon.assert.notCalled(Messenger._emitInstanceUpdateAction)
        done()
      }
    })
    it('should trigger an error if instance was not fully populated and bypass emitInstanceUpdate', function (done) {
      Messenger.emitInstanceUpdate({ _id: 'some-id' }, 'update')
      sinon.assert.calledOnce(errorModule.log)
      expect(errorModule.log.lastCall.args[0].message).to.equal('emitInstanceUpdate malformed instance')
      sinon.assert.notCalled(Messenger._emitInstanceUpdateAction)
      done()
    })
    it('should call _emitInstanceUpdateAction if validation passed', function (done) {
      var instance = {
        _id: 'some-id',
        owner: {
          github: 1,
          username: 'anton',
          gravatar: 'https://gravatar.com/anton'
        },
        createdBy: {
          github: 2,
          username: 'peter',
          gravatar: 'https://gravatar.com/peter'
        }
      }
      Messenger.emitInstanceUpdate(instance, 'update')
      sinon.assert.calledOnce(Messenger._emitInstanceUpdateAction)
      sinon.assert.calledWith(Messenger._emitInstanceUpdateAction, instance, 'update')
      done()
    })
  })
  describe('#canJoin', function () {
    it('should return true if authToken provided', function (done) {
      var socket = {
        request: {
          query: {
            token: 'some-token'
          }
        }
      }
      Messenger.canJoin(socket, {}, function (err, canJoin) {
        expect(err).to.be.null()
        expect(canJoin).to.be.true()
        done()
      })
    })
    it('should return error if both authToken and userId are null', function (done) {
      var socket = {
        request: {
          query: {
            token: null
          },
          session: {
            passport: {
              user: null
            }
          }
        }
      }
      Messenger.canJoin(socket, {}, function (err, canJoin) {
        expect(err.message).to.equal('No authentication data')
        expect(canJoin).to.be.undefined()
        done()
      })
    })
    it('should return true if accountId equals user.accounts.github.id', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      var user = new User()
      user.accounts = {
        github: {
          id: 'some-github-id'
        }
      }
      sinon.stub(User, 'findById').yields(null, user)
      Messenger.canJoin(socket, { name: 'some-github-id' }, function (err, canJoin) {
        expect(err).to.be.null()
        expect(canJoin).to.be.true()
        User.findById.restore()
        done()
      })
    })
    it('should return error if user search callbacks with error', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      sinon.stub(User, 'findById').yields(new Error('Mongoose error'))
      Messenger.canJoin(socket, { name: 'some-org-id' }, function (err, canJoin) {
        expect(err.message).to.equal('Mongoose error')
        expect(canJoin).to.be.undefined()
        User.findById.restore()
        done()
      })
    })
    it('should return error if user not found', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      sinon.stub(User, 'findById').yields(null, null)
      Messenger.canJoin(socket, { name: 'some-org-id' }, function (err, canJoin) {
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('User not found')
        expect(canJoin).to.be.undefined()
        User.findById.restore()
        done()
      })
    })
    it('should return error if org search callbacks with error', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      var user = new User()
      user.accounts = {
        github: {
          id: 'some-github-id'
        }
      }
      sinon.stub(User, 'findById').yields(null, user)
      sinon.stub(User.prototype, 'findGithubOrgByGithubId').yields(new Error('Mongoose error'))
      Messenger.canJoin(socket, { name: 'some-org-id' }, function (err, canJoin) {
        expect(err.message).to.equal('Mongoose error')
        expect(canJoin).to.be.undefined()
        User.findById.restore()
        User.prototype.findGithubOrgByGithubId.restore()
        done()
      })
    })
    it('should return error if org not found', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      var user = new User()
      user.accounts = {
        github: {
          id: 'some-github-id'
        }
      }
      sinon.stub(User, 'findById').yields(null, user)
      sinon.stub(User.prototype, 'findGithubOrgByGithubId').yields(null, null)
      Messenger.canJoin(socket, { name: 'some-org-id' }, function (err, canJoin) {
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('Org not found')
        expect(canJoin).to.be.undefined()
        User.findById.restore()
        User.prototype.findGithubOrgByGithubId.restore()
        done()
      })
    })
    it('should return error if membership check returned error', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      var user = new User()
      user.accounts = {
        github: {
          accessToken: 'token'
        }
      }
      sinon.stub(User, 'findById').yields(null, user)
      sinon.stub(User.prototype, 'findGithubOrgByGithubId').yields(null, { login: 'Runnable' })
      sinon.stub(GitHub.prototype, 'isOrgMember').yields(new Error('GitHub error'))
      Messenger.canJoin(socket, { name: 'some-org-id' }, function (err, canJoin) {
        expect(err.message).to.equal('GitHub error')
        expect(canJoin).to.be.undefined()
        User.findById.restore()
        User.prototype.findGithubOrgByGithubId.restore()
        GitHub.prototype.isOrgMember.restore()
        done()
      })
    })
    it('should return false if user is not a member of an org', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      var user = new User()
      user.accounts = {
        github: {
          accessToken: 'token'
        }
      }
      sinon.stub(User, 'findById').yields(null, user)
      sinon.stub(User.prototype, 'findGithubOrgByGithubId').yields(null, { login: 'Runnable' })
      sinon.stub(GitHub.prototype, 'isOrgMember').yields(null, false)
      Messenger.canJoin(socket, { name: 'some-org-id' }, function (err, canJoin) {
        expect(err).to.be.null()
        expect(canJoin).to.be.false()
        User.findById.restore()
        User.prototype.findGithubOrgByGithubId.restore()
        GitHub.prototype.isOrgMember.restore()
        done()
      })
    })
    it('should return true if user is a member of an org', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      var user = new User()
      user.accounts = {
        github: {
          accessToken: 'token'
        }
      }
      sinon.stub(User, 'findById').yields(null, user)
      sinon.stub(User.prototype, 'findGithubOrgByGithubId').yields(null, { login: 'Runnable' })
      sinon.stub(GitHub.prototype, 'isOrgMember').yields(null, true)
      Messenger.canJoin(socket, { name: 'some-org-id' }, function (err, canJoin) {
        expect(err).to.be.null()
        expect(canJoin).to.be.true()
        User.findById.restore()
        User.prototype.findGithubOrgByGithubId.restore()
        GitHub.prototype.isOrgMember.restore()
        done()
      })
    })
  })

  describe('#subscribeStreamHandler', function () {
    describe('Failures', function () {
      it('should return error if name is empty', function (done) {
        var id = 'some-id'
        var data = {type: 'some-type', action: 'join'}
        var socket = {}
        socket.write = sinon.stub()
        Messenger.subscribeStreamHandler(socket, id, data).asCallback(function (err) {
          sinon.assert.calledOnce(socket.write)
          sinon.assert.calledWithExactly(
            socket.write,
            {
              id: id,
              error: 'name, type and action are required',
              data: data
            }
          )
          expect(err).to.exist()
          expect(err.message).to.match(/name.+type.+action.+required/)
          done()
        })
      })
      it('should return error if action is empty', function (done) {
        var id = 'some-id'
        var data = {type: 'some-type', name: 'some-name'}
        var socket = {}
        socket.write = sinon.stub()
        Messenger.subscribeStreamHandler(socket, id, data).asCallback(function (err) {
          sinon.assert.calledOnce(socket.write)
          sinon.assert.calledWithExactly(
            socket.write,
            {
              id: id,
              error: 'name, type and action are required',
              data: data
            }
          )
          expect(err).to.exist()
          expect(err.message).to.match(/name.+type.+action.+required/)
          done()
        })
      })
      it('should return error if type is empty', function (done) {
        var id = 'some-id'
        var data = {action: 'join', name: 'some-name'}
        var socket = {}
        socket.write = sinon.stub()
        Messenger.subscribeStreamHandler(socket, id, data).asCallback(function (err) {
          sinon.assert.calledOnce(socket.write)
          sinon.assert.calledWithExactly(
            socket.write,
            {
              id: id,
              error: 'name, type and action are required',
              data: data
            }
          )
          expect(err).to.exist()
          expect(err.message).to.match(/name.+type.+action.+required/)
          done()
        })
      })
      it('should return access denied if user wasnot found', function (done) {
        var id = 'some-id'
        var data = {action: 'join', name: 'some-name', type: 'data'}
        var socket = {
          request: {
            session: {
              passport: {
                user: 'some-user-id'
              }
            }
          }
        }
        var count = createCount(2, done)
        socket.write = function (msg) {
          expect(msg.id).to.equal(id)
          expect(msg.error).to.equal('access denied')
          expect(msg.data).to.equal(data)
          User.findById.restore()
          count.next()
        }
        var error = new Error('Mongoose error')
        sinon.stub(User, 'findById').yields(error)
        Messenger.subscribeStreamHandler(socket, id, data)
          .catch(function (err) {
            expect(err.message).to.equal('access denied')
          })
          .asCallback(count.next)
      })
    })
    describe('Success', function () {
      var id = 'some-id'
      var mockUser = {
        _id: id
      }
      beforeEach(function (done) {
        sinon.stub(User, 'findById').yields(null, mockUser)
        sinon.stub(Messenger, 'canJoinAsync').resolves()
        sinon.stub(Messenger, 'joinRoom')
        done()
      })
      afterEach(function (done) {
        User.findById.restore()
        Messenger.canJoinAsync.restore()
        Messenger.joinRoom.restore()
        done()
      })
      it('should join the room successfully', function (done) {
        var data = { action: 'join', name: 'some-name', type: 'data' }
        var socket = {
          request: {
            session: {
              passport: {
                user: id
              }
            }
          },
          primus: {},
          write: sinon.spy()
        }
        Messenger.subscribeStreamHandler(socket, id, data)
          .then(function () {
            sinon.assert.calledWith(Messenger.canJoinAsync, socket, data)
            sinon.assert.calledWith(Messenger.joinRoom, socket, data.type, data.name)
          })
          .asCallback(done)
      })
    })
  })
})
