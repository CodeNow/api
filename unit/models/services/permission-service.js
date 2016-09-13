'use strict'
require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var OrganizationService = require('models/services/organization-service')
var PermissionService = require('models/services/permission-service')
var UserService = require('models/services/user-service')
var Github = require('models/apis/github')

describe('PermissionService', function () {
  var sessionUser = {
    accounts: {
      github: {
        id: '1'
      }
    }
  }
  var helloRunnable = {
    accounts: {
      github: {
        id: process.env.HELLO_RUNNABLE_GITHUB_ID
      }
    }
  }

  describe('ensureOwnerOrModerator', function () {
    beforeEach(function (done) {
      sinon.stub(Github.prototype, 'getUserAuthorizedOrgs')
        .yieldsAsync(null, [ { id: '2' } ])
      sinon.spy(PermissionService, 'isOwnerOf')
      sinon.spy(PermissionService, 'isModerator')
      done()
    })

    afterEach(function (done) {
      Github.prototype.getUserAuthorizedOrgs.restore()
      PermissionService.isOwnerOf.restore()
      PermissionService.isModerator.restore()
      done()
    })

    it('should resolve if an owner', function (done) {
      var model = { owner: { github: '2' } }
      PermissionService.ensureOwnerOrModerator({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, model)
      .tap(function (checkedModel) {
        expect(model).to.equal(checkedModel)
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledOnce(PermissionService.isModerator)
      })
      .asCallback(done)
    })

    it('should resolve if a moderator', function (done) {
      var model = { owner: { github: '2' } }
      PermissionService.ensureOwnerOrModerator({
        accounts: {
          github: {
            id: '3'
          }
        },
        isModerator: true
      }, model)
      .tap(function (checkedModel) {
        expect(model).to.equal(checkedModel)
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledOnce(PermissionService.isModerator)
      })
      .asCallback(done)
    })

    it('should reject if both checks failed', function (done) {
      PermissionService.ensureOwnerOrModerator({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, { owner: { github: '1' } })
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('access denied (!isModerator)')
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledOnce(PermissionService.isModerator)
        done()
      })
    })

    it('should call isOwnerOf with correct params', function (done) {
      var model = { owner: { github: '1' } }
      PermissionService.ensureOwnerOrModerator(sessionUser, model)
      .then(function () {
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledWith(PermissionService.isOwnerOf, sessionUser, model)
      })
      .asCallback(done)
    })

    it('should call isModerator with correct params', function (done) {
      var model = { owner: { github: '1' } }
      PermissionService.ensureOwnerOrModerator(sessionUser, model)
      .then(function () {
        sinon.assert.calledOnce(PermissionService.isModerator)
        sinon.assert.calledWith(PermissionService.isModerator, sessionUser)
      })
      .asCallback(done)
    })
  })

  describe('ensureModelAccess', function () {
    beforeEach(function (done) {
      sinon.stub(Github.prototype, 'getUserAuthorizedOrgs')
        .yieldsAsync(null, [ { id: '2' } ])
      sinon.spy(PermissionService, 'isOwnerOf')
      sinon.spy(PermissionService, 'isModerator')
      sinon.spy(PermissionService, 'isHelloRunnableOwnerOf')
      done()
    })

    afterEach(function (done) {
      Github.prototype.getUserAuthorizedOrgs.restore()
      PermissionService.isOwnerOf.restore()
      PermissionService.isModerator.restore()
      PermissionService.isHelloRunnableOwnerOf.restore()
      done()
    })

    it('should resolve if an owner', function (done) {
      var model = { owner: { github: '2' } }
      PermissionService.ensureModelAccess({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, model)
      .tap(function (checkedModel) {
        expect(model).to.equal(checkedModel)
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledOnce(PermissionService.isModerator)
        sinon.assert.calledOnce(PermissionService.isHelloRunnableOwnerOf)
      })
      .asCallback(done)
    })

    it('should resolve if a moderator', function (done) {
      var model = { owner: { github: '2' } }
      PermissionService.ensureModelAccess({
        accounts: {
          github: {
            id: '3'
          }
        },
        isModerator: true
      }, model)
      .tap(function (checkedModel) {
        expect(model).to.equal(checkedModel)
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledOnce(PermissionService.isModerator)
        sinon.assert.calledOnce(PermissionService.isHelloRunnableOwnerOf)
      })
      .asCallback(done)
    })

    it('should resolve if a helloRunnable', function (done) {
      var model = { owner: { github: '2' } }
      PermissionService.ensureModelAccess(helloRunnable, model)
      .tap(function (checkedModel) {
        expect(model).to.equal(checkedModel)
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledOnce(PermissionService.isModerator)
        sinon.assert.calledOnce(PermissionService.isHelloRunnableOwnerOf)
      })
      .asCallback(done)
    })

    it('should reject if all checks failed', function (done) {
      PermissionService.ensureModelAccess({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, { owner: { github: '1' } })
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Access denied (!owner)')
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledOnce(PermissionService.isModerator)
        sinon.assert.calledOnce(PermissionService.isHelloRunnableOwnerOf)
        done()
      })
    })

    it('should call isOwnerOf with correct params', function (done) {
      var model = { owner: { github: '1' } }
      PermissionService.ensureModelAccess(sessionUser, model)
      .then(function () {
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledWith(PermissionService.isOwnerOf, sessionUser, model)
      })
      .asCallback(done)
    })

    it('should call isModerator with correct params', function (done) {
      var model = { owner: { github: '1' } }
      PermissionService.ensureModelAccess(sessionUser, model)
      .then(function () {
        sinon.assert.calledOnce(PermissionService.isModerator)
        sinon.assert.calledWith(PermissionService.isModerator, sessionUser)
      })
      .asCallback(done)
    })

    it('should call isHelloRunnableOwnerOf with correct params', function (done) {
      var model = { owner: { github: '1' } }
      PermissionService.ensureModelAccess(sessionUser, model)
      .then(function () {
        sinon.assert.calledOnce(PermissionService.isHelloRunnableOwnerOf)
        sinon.assert.calledWith(PermissionService.isHelloRunnableOwnerOf, sessionUser, model)
      })
      .asCallback(done)
    })
  })

  describe('isModerator', function () {
    it('should reject if user is not moderator', function (done) {
      PermissionService.isModerator({
        accounts: {
          github: {
            id: '2'
          }
        }
      })
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('access denied (!isModerator)')
        done()
      })
    })

    it('should resolve if user is moderator', function (done) {
      PermissionService.isModerator({
        accounts: {
          github: {
            id: '2'
          }
        },
        isModerator: true
      })
      .asCallback(done)
    })
  })

  describe('isHelloRunnableOwnerOf', function (done) {
    it('should resolve if HELLO_RUNNABLE_GITHUB_ID is the same as owner', function (done) {
      PermissionService.isHelloRunnableOwnerOf(sessionUser, { owner: { github: process.env.HELLO_RUNNABLE_GITHUB_ID } })
      .asCallback(done)
    })

    it('should resolve if sessionUser is hellorunnable', function (done) {
      PermissionService.isHelloRunnableOwnerOf(helloRunnable, { owner: { github: '1' } })
      .asCallback(done)
    })

    it('should reject if sessionUser do not have access to the model', function (done) {
      PermissionService.isHelloRunnableOwnerOf({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, { owner: { github: '3' } })
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Access denied (!owner)')
        done()
      })
    })
  })

  describe('isOwnerOf', function () {
    var org
    var user
    beforeEach(function (done) {
      org = {
        name: 'asdasd',
        id: 1
      }
      user = {
        name: '123123',
        id: 10
      }
      sinon.stub(UserService, 'getByGithubId').resolves(user)
      sinon.stub(OrganizationService, 'getByGithubId').resolves(org)
      sinon.stub(OrganizationService, 'addUser').resolves(org)
      done()
    })

    afterEach(function (done) {
      UserService.getByGithubId.restore()
      OrganizationService.getByGithubId.restore()
      OrganizationService.addUser.restore()
      done()
    })

    it('should resolve if sessionUser is the same as owner', function (done) {
      PermissionService.isOwnerOf(sessionUser, { owner: { github: '1' } })
      .asCallback(done)
    })

    it('should resolve if sessionUser is the same as owner', function (done) {
      PermissionService.isOwnerOf(sessionUser, { owner: { github: '1' } })
      .asCallback(done)
    })

    it('should reject if sessionUser is helloRunnable', function (done) {
      PermissionService.isOwnerOf(helloRunnable, { owner: { github: '1' } })
        .catch(function (err) {
          expect(err.message).to.equal('HelloRunnable should always fail org owner checks')
          done()
        })
    })
    it('should resolve if sessionUser shares an org', function (done) {
      user.organizations = [org]
      PermissionService.isOwnerOf({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, { owner: { github: '1' } })
        .tap(function () {
          sinon.assert.calledOnce(UserService.getByGithubId)
        })
        .asCallback(done)
    })

    it('should fetch the org from BigPappa, and attempt to add the user', function (done) {
      PermissionService.isOwnerOf({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, { owner: { github: '3' } })
        .tap(function () {
          sinon.assert.calledOnce(UserService.getByGithubId)
          sinon.assert.calledOnce(OrganizationService.getByGithubId)
          sinon.assert.calledOnce(OrganizationService.addUser)
          sinon.assert.calledWith(OrganizationService.addUser, org, user)
        })
        .asCallback(function () {
          done()
        })
    })
    it('should reject if sessionUser do not have access to the model', function (done) {
      OrganizationService.addUser.rejects(new Error('doesnt matter'))
      PermissionService.isOwnerOf({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, { owner: { github: '3' } })
        .tap(function () {
          sinon.assert.calledOnce(UserService.getByGithubId)
          sinon.assert.calledOnce(OrganizationService.getByGithubId)
          sinon.assert.calledOnce(OrganizationService.addUser)
          sinon.assert.calledWith(OrganizationService.addUser, org, user)
        })
        .catch(function (err) {
          expect(err.message).to.equal('Access denied (!owner)')
          done()
        })
    })
  })
})
