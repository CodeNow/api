'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var Code = require('code')
var expect = Code.expect

var sinon = require('sinon')

var Slack = require('notifications/slack')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Slack: ' + moduleName, function () {
  before(function (done) {
    process.env.ENABLE_SLACK_MESSAGES = 'true'
    done()
  })
  after(function (done) {
    process.env.ENABLE_SLACK_MESSAGES = 'false'
    done()
  })
  describe('#_canSendMessage', function () {
    describe('with setting disabled locally', function () {
      before(function (done) {
        process.env.ENABLE_SLACK_MESSAGES = 'false'
        done()
      })
      after(function (done) {
        process.env.ENABLE_SLACK_MESSAGES = 'true'
        done()
      })
      it('should return false if notifications are enabled', function (done) {
        var settings = {
          notifications: {
            slack: {
              enabled: true
            }
          }
        }
        var slack = new Slack(settings)
        expect(slack._canSendMessage()).to.be.false()
        done()
      })
    })
    it('should return true if notifications are enabled', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: true
          }
        }
      }
      var slack = new Slack(settings)
      expect(slack._canSendMessage()).to.be.true()
      done()
    })
    it('should return true if notifications are disabled', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: false
          }
        }
      }
      var slack = new Slack(settings)
      expect(slack._canSendMessage()).to.be.false()
      done()
    })
  })
  describe('#sendDirectMessage', function () {
    it('should do nothing if user not found', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: false
          }
        }
      }
      var slack = new Slack(settings)
      sinon.stub(slack.slackClient, 'sendPrivateMessage')
      slack.sendDirectMessage('podviaznikov', { text: 'hello' }, function (err) {
        expect(err).to.not.exist()
        expect(slack.slackClient.sendPrivateMessage.callCount).to.equal(0)
        done()
      })
    })
    it('should return err if slack client returned error', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: false,
            githubUsernameToSlackIdMap: {
              'podviaznikov': 123123
            }
          }
        }
      }
      var slack = new Slack(settings)
      sinon.stub(slack.slackClient, 'sendPrivateMessage').yieldsAsync(new Error('slack'))
      slack.sendDirectMessage('podviaznikov', { text: 'hello' }, function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('slack')
        expect(slack.slackClient.sendPrivateMessage.callCount).to.equal(1)
        var args = slack.slackClient.sendPrivateMessage.getCall(0).args
        expect(args[0]).to.equal(123123)
        expect(args[1].text).to.equal('hello')
        done()
      })
    })
    it('should send private message if user found', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: false,
            githubUsernameToSlackIdMap: {
              'podviaznikov': 123123
            }
          }
        }
      }
      var slack = new Slack(settings)
      sinon.stub(slack.slackClient, 'sendPrivateMessage').yieldsAsync(null)
      slack.sendDirectMessage('podviaznikov', { text: 'hello' }, function (err) {
        expect(err).to.not.exist()
        expect(slack.slackClient.sendPrivateMessage.callCount).to.equal(1)
        var args = slack.slackClient.sendPrivateMessage.getCall(0).args
        expect(args[0]).to.equal(123123)
        expect(args[1].text).to.equal('hello')
        done()
      })
    })
  })
  describe('#notifyOnAutoDeploy', function () {
    it('should do nothing if slack messaging is disabled', function (done) {
      var slack = new Slack()
      slack.notifyOnAutoDeploy({}, [], function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        done()
      })
    })
    it('should do nothing if slack messaging is disabled in settings', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: false
          }
        }
      }
      var slack = new Slack(settings)
      slack.notifyOnAutoDeploy({}, [], function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        done()
      })
    })
    it('should do nothing if instance = null', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: true
          }
        }
      }
      var slack = new Slack(settings)
      slack.notifyOnAutoDeploy({}, null, function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        done()
      })
    })
    it('should do nothing if user was not found', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: true
          }
        }
      }
      var slack = new Slack(settings)
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      slack.notifyOnAutoDeploy({}, instance, function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        done()
      })
    })
    it('should send direct message', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: true
          }
        }
      }
      var slack = new Slack(settings)
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9',
        committer: {
          username: 'podviaznikov'
        }
      }
      var commit2 = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        author: {
          username: 'podviaznikov'
        }
      }
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        commitLog: [ headCommit, commit2 ],
        repo: 'CodeNow/api',
        repoName: 'api'
      }
      sinon.stub(slack, 'sendDirectMessage').yieldsAsync(null)
      slack.notifyOnAutoDeploy(gitInfo, instance, function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        expect(slack.sendDirectMessage.callCount).to.equal(1)
        var args = slack.sendDirectMessage.getCall(0).args
        expect(args[0]).to.equal(headCommit.committer.username)
        expect(args[1].text).to.exist()
        done()
      })
    })
  })

  describe('#notifyOnAutoFork', function () {
    it('should do nothing if slack messaging is disabled', function (done) {
      var slack = new Slack()
      slack.notifyOnAutoFork({}, {}, function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        done()
      })
    })
    it('should do nothing if slack messaging is disabled in settings', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: false
          }
        }
      }
      var slack = new Slack(settings)
      slack.notifyOnAutoFork({}, {}, function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        done()
      })
    })
    it('should do nothing if instance = null', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: true
          }
        }
      }
      var slack = new Slack(settings)
      slack.notifyOnAutoFork({}, null, function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        done()
      })
    })

    it('should do nothing if user was not found', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: true
          }
        }
      }
      var slack = new Slack(settings)
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      slack.notifyOnAutoFork({}, instance, function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        done()
      })
    })
    it('should send direct message', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: true
          }
        }
      }
      var slack = new Slack(settings)
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9',
        committer: {
          username: 'podviaznikov'
        }
      }
      var commit2 = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        author: {
          username: 'podviaznikov'
        }
      }
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        commitLog: [ headCommit, commit2 ],
        repo: 'CodeNow/api',
        repoName: 'api',
        user: {
          login: 'anton'
        }
      }
      sinon.stub(slack, 'sendDirectMessage').yieldsAsync(null)
      slack.notifyOnAutoFork(gitInfo, instance, function (err, resp) {
        expect(err).to.equal(null)
        expect(resp).to.equal(undefined)
        expect(slack.sendDirectMessage.callCount).to.equal(1)
        var args = slack.sendDirectMessage.getCall(0).args
        expect(args[0]).to.equal(gitInfo.user.login)
        expect(args[1].text).to.exist()
        done()
      })
    })
  })

  describe('#_createAutoUpdateText', function () {
    it('should return text messages', function (done) {
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
      }
      var commit2 = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        author: {
          username: 'podviaznikov'
        }
      }
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        commitLog: [ headCommit, commit2 ],
        repo: 'CodeNow/api',
        repoName: 'api'
      }
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      var domain = process.env.APP_SUBDOMAIN + '.' + process.env.DOMAIN
      var text = Slack.createAutoDeployText(gitInfo, instance)
      var expected = 'Your <http://localhost:3031/actions/redirect?'
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcommit%2Fa240edf982d467201845b3bf10ccbe16f6049ea9'
      expected += '|changes> (init &amp commit &amp push long test   next line   3d... and '
      expected += '<http://localhost:3031/actions/redirect?'
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcompare%2Fa240edf982d4...a240edf982d4|1 more>)'
      expected += ' to CodeNow/api (feature-1) are deployed on'
      expected += ' <https://' + domain + '/CodeNow/server-1?ref=slack|server-1>'
      expect(text).to.equal(expected)
      done()
    })

    it('should return text if commitLog is []', function (done) {
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
      }
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        commitLog: [],
        repo: 'CodeNow/api',
        repoName: 'api'
      }
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      var domain = process.env.APP_SUBDOMAIN + '.' + process.env.DOMAIN
      var text = Slack.createAutoDeployText(gitInfo, instance)
      var expected = 'Your <http://localhost:3031/actions/redirect?'
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcommit%2Fa240edf982d467201845b3bf10ccbe16f6049ea9'
      expected += '|changes> (init &amp commit &amp push long test   next line   3d...)'
      expected += ' to CodeNow/api (feature-1) are deployed on'
      expected += ' <https://' + domain + '/CodeNow/server-1?ref=slack|server-1>'
      expect(text).to.equal(expected)
      done()
    })
  })
  describe('#createAutoForkText', function () {
    it('should return text messages', function (done) {
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
      }
      var commit2 = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        author: {
          username: 'podviaznikov'
        }
      }
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        commitLog: [ headCommit, commit2 ],
        repo: 'CodeNow/api',
        repoName: 'api'
      }
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      var domain = process.env.APP_SUBDOMAIN + '.' + process.env.DOMAIN
      var text = Slack.createAutoForkText(gitInfo, instance)
      var expected = 'Your <http://localhost:3031/actions/redirect?'
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcommit%2Fa240edf982d467201845b3bf10ccbe16f6049ea9'
      expected += '|changes> (init &amp commit &amp push long test   next line   3d... and '
      expected += '<http://localhost:3031/actions/redirect?'
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcompare%2Fa240edf982d4...a240edf982d4|1 more>)'
      expected += ' to CodeNow/api (feature-1) are deployed on '
      expected += '<https://' + domain + '/CodeNow/server-1?ref=slack|server-1>'
      expect(text).to.equal(expected)
      done()
    })

    it('should return text if commitLog is []', function (done) {
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
      }
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        commitLog: [],
        repo: 'CodeNow/api',
        repoName: 'api'
      }
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      var domain = process.env.APP_SUBDOMAIN + '.' + process.env.DOMAIN
      var text = Slack.createAutoForkText(gitInfo, instance)
      var expected = 'Your <http://localhost:3031/actions/redirect?'
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcommit%2Fa240edf982d467201845b3bf10ccbe16f6049ea9'
      expected += '|changes> (init &amp commit &amp push long test   next line   3d...)'
      expected += ' to CodeNow/api (feature-1) are deployed on '
      expected += '<https://' + domain + '/CodeNow/server-1?ref=slack|server-1>'
      expect(text).to.equal(expected)
      done()
    })
    it('should return text if commitLog is null', function (done) {
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
      }
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        repo: 'CodeNow/api',
        repoName: 'api'
      }
      var instance = {
        name: 'server-1',
        owner: {
          github: 3213,
          username: 'CodeNow'
        }
      }
      var domain = process.env.APP_SUBDOMAIN + '.' + process.env.DOMAIN
      var text = Slack.createAutoForkText(gitInfo, instance)
      var expected = 'Your <http://localhost:3031/actions/redirect?'
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcommit%2Fa240edf982d467201845b3bf10ccbe16f6049ea9'
      expected += '|changes> (init &amp commit &amp push long test   next line   3d...)'
      expected += ' to CodeNow/api (feature-1) are deployed on '
      expected += '<https://' + domain + '/CodeNow/server-1?ref=slack|server-1>'
      expect(text).to.equal(expected)
      done()
    })
  })
})
