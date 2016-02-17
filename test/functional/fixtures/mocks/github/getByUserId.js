'use strict'

var sinon = require('sinon')
var Github = require('models/apis/github')
var User = require('models/mongo/user.js')

function getUserResult (userId, username) {
  return {
    'login': username,
    'id': userId,
    'avatar_url': 'https://avatars.githubusercontent.com/u/' + userId + '?',
    'gravatar_id': '',
    'url': 'https://api.github.com/users/' + username,
    'html_url': 'https://github.com/' + username,
    'followers_url': 'https://api.github.com/users/' + username + '/followers',
    'following_url': 'https://api.github.com/users/' + username + '/following{/other_user}',
    'gists_url': 'https://api.github.com/users/' + username + '/gists{/gist_id}',
    'starred_url': 'https://api.github.com/users/' + username + '/starred{/owner}{/repo}',
    'subscriptions_url': 'https://api.github.com/users/' + username + '/subscriptions',
    'organizations_url': 'https://api.github.com/users/' + username + '/orgs',
    'repos_url': 'https://api.github.com/users/' + username + '/repos',
    'events_url': 'https://api.github.com/users/' + username + '/events{/privacy}',
    'received_events_url': 'https://api.github.com/users/' + username + '/received_events',
    'type': 'User',
    'site_admin': false,
    'name': username,
    'company': '',
    'blog': 'http://twitter.com/tjmehta',
    'location': 'San Francisco',
    'email': '',
    'hireable': true,
    'bio': '',
    'public_repos': 77,
    'public_gists': 8,
    'followers': 17,
    'following': 90,
    'created_at': '2011-02-27T01:20:41Z',
    'updated_at': '2014-06-24T23:28:16Z'
  }
}
// Example of use
// beforeEach(
//  mockGetUserById.stubBefore(function () {
//    return [{
//      id: ctx.user.attrs.accounts.github.id,
//      username: ctx.user.attrs.accounts.github.username
//    }, {
//      id: 11111,
//      username: 'Runnable'
//    }]
//  })
// )

/**
 * This is to be used in a beforeEach to initialize the mock for getUserById.
 * @param getUserArrayFn This function should return an array of users to use as the user search.
 *  this is mostly useful for teams and orgs.  User will be queried from the database to ensure
 *  accuracy
 * @returns {Function}
 */
module.exports.stubBefore = function (getUserArrayFn) {
  return function (done) {
    if (Github.prototype.getUserById && Github.prototype.getUserById.restore) {
      Github.prototype.getUserById.restore()
    }
    sinon.stub(Github.prototype, 'getUserById', function (id, cb) {
      var userArray = getUserArrayFn ? getUserArrayFn() : []
      var result = null
      userArray.every(function (userInfo) {
        if (userInfo.id === id) {
          result = getUserResult(userInfo.id, userInfo.username)
          return false
        }
        return true
      })
      if (!result) {
        User.findOneBy('accounts.github.id', id, function (err, user) {
          if (err) { return cb(err) }
          if (!user) { return cb('User with id ' + id + ' could not be found') }
          var username = user.accounts.github.username
          userArray.push({
            id: id,
            username: username
          })
          result = getUserResult(id, username)
          cb(null, result)
        })
      } else {
        cb(null, result)
      }
    })
    done()
  }
}

// Example of use
// afterEach(mockGetUserById.stubAfter)
/**
 * Should be user in an afterEach
 * @param done
 */
module.exports.stubAfter = function (done) {
  Github.prototype.getUserById.restore()
  done()
}
