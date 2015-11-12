/**
 * @module lib/middlewares/me
 */
'use strict'

var flow = require('middleware-flow')
var hasKeypaths = require('101/has-keypaths')
var mw = require('dat-middleware')

var Github = require('models/apis/github')
var User = require('models/mongo/user')
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware')
var error = require('error')
var logger = require('middlewares/logger')(__filename)
var transformations = require('middlewares/transformations')
var utils = require('middlewares/utils')

var Boom = mw.Boom
var log = logger.log
var replaceMeWithUserId = transformations.replaceMeWithUserId

module.exports = createMongooseMiddleware(User, 'sessionUser', {
  isUser: function (req, res, next) {
    log.trace({
      tx: true
    }, 'isUser')
    flow.series(
      mw.params('userId').mapValues(replaceMeWithUserId),
      checkUserIdsMatch
    )(req, res, next)
    function checkUserIdsMatch () {
      log.trace({
        tx: true
      }, 'checkUserIdsMatch')
      if (!utils.equalObjectIds(req.sessionUser._id, req.params.userId)) {
        log.trace({
          tx: true,
          sessionUserId: req.sessionUser._id,
          paramsUserId: req.params.userId
        }, 'checkUserIdsMatch - match')
        return next(error(403, 'access denied (!user)'))
      }
      log.trace({
        tx: true,
        sessionUserId: req.sessionUser._id,
        paramsUserId: req.params.userId
      }, 'checkUserIdsMatch - no match')
      next()
    }
  },
  isOwnerOf: function (modelKey) {
    return function (req, res, next) {
      log.trace({
        key: modelKey,
        req: req,
        tx: true
      }, 'isOwnerOf')
      var model = utils.replacePlaceholders(req, modelKey)
      var modelGithubId = model.owner.github
      var userGithubId = req.sessionUser.accounts.github.id
      if (userGithubId !== modelGithubId) {
        var token = req.sessionUser.accounts.github.accessToken
        var github = new Github({ token: token })
        github.getUserAuthorizedOrgs(function (err, orgs) {
          if (err) { return next(err) }
          var isMember = orgs.some(hasKeypaths({
            'id.toString()': modelGithubId.toString()
          }))
          if (!isMember) {
            log.error({tx: true}, 'Access denied (!owner)')
            next(Boom.forbidden('Access denied (!owner)', { githubId: modelGithubId }))
          } else {
            next()
          }
        })
      } else {
        next()
      }
    }
  },
  isRegistered: function (req, res, next) {
    this.permission('registered')(req, res, next)
  },
  isVerified: function (req, res, next) {
    this.permission('isVerified')(req, res, next)
  },
  isModerator: function (req, res, next) {
    this.permission('isModerator')(req, res, next)
  },
  permission: function (attr) {
    var userKey = this.key
    return flow.series(
      logger(userKey + ' permission: ' + attr),
      mw.req(userKey + '.' + attr).matches(/true/)
        .else(mw.next(Boom.forbidden('access denied (!' + attr + ')')))
    )
  }
})
