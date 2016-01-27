'use strict'

require('loadenv')()

var sinon = require('sinon')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var GitHub = require('models/apis/github')
var Messenger = require('socket/messenger')
var User = require('models/mongo/user')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Messenger: ' + moduleName, function () {
  describe('emitInstanceUpdate', function () {
    beforeEach(function (done) {
      sinon.stub(Messenger, '_emitInstanceUpdateAction')
      done()
    })
    afterEach(function (done) {
      Messenger._emitInstanceUpdateAction.restore()
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
    it('should throw if instance was not fully populated', function (done) {
      try {
        Messenger.emitInstanceUpdate({ _id: 'some-id' }, 'update')
        done(new Error('Should never happen'))
      } catch (err) {
        expect(err.message).to.equal('emitInstanceUpdate malformed instance')
        sinon.assert.notCalled(Messenger._emitInstanceUpdateAction)
        done()
      }
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
    it('should return false if both authToken and userId are null', function (done) {
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
        expect(err).to.be.null()
        expect(canJoin).to.be.false()
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
    it('should return error if name is empty', function (done) {
      var id = 'some-id'
      var data = { type: 'some-type', action: 'join' }
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
      var data = { type: 'some-type', name: 'some-name' }
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
      var data = { action: 'join', name: 'some-name' }
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
      var data = { action: 'join', name: 'some-name', type: 'data' }
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      }
      socket.write = function (msg) {
        expect(msg.id).to.equal(id)
        expect(msg.error).to.equal('access denied')
        expect(msg.data).to.equal(data)
        User.findById.restore()
        done()
      }
      sinon.stub(User, 'findById').yields(new Error('Mongoose error'))
      Messenger.subscribeStreamHandler(socket, id, data)
    })
  })
})
