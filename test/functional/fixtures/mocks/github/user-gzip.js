var nock = require('nock')
var uuid = require('uuid')
var isObject = require('101/is-object')
var zlib = require('zlib')
var randStr = require('randomstring').generate

var userId = 0
function nextUserId () {
  userId++
  return userId
}

module.exports = function (userId, username, token, callback) {
  if (isObject(userId)) {
    // assume user model
    var user = userId.toJSON ? userId.toJSON() : userId
    var github = user.accounts.github
    userId = github.id
    username = github.login
    token = user.accounts.github.accessToken
  } else {
    userId = userId || nextUserId()
    username = username || randStr(5)
    token = token || uuid()
  }

  var data = {
    'login': username,
    'id': userId,
    'access_token': token,
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
  var headers = {
    'etag': uuid(),
    'link': '<https://api.github.com/organizations/2828361/repos?page=2> rel="next", ' +
      '<https://api.github.com/organizations/2828361/repos?page=7&access_token=' + token + '> rel="last"',
    'content-encoding': 'gzip',
    'access-control-allow-credentials': true,
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'ETag, Link, X-GitHub-OTP, X-RateLimit-Limit, ' +
      'X-RateLimit-Remaining, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval'
  }

  zlib.gzip(JSON.stringify(data), function (err, dataZip) {
    if (err) { return callback(err) }
    // console.log('this is the raw data to a string', dataZip.toString())
    var urlRegExp = new RegExp('\/user[?]access_token=' + token)
    nock('https://api.github.com:443')
      .filteringPath(urlRegExp, '/user')
      .get('/user')
      .twice()
      .reply(200, [dataZip], headers)
    callback()
  })
}
