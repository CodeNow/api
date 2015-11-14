var nock = require('nock')
var multiline = require('multiline')
var randStr = require('randomstring').generate

var _orgId = 1000 // these should not intersect with github user-ids
function nextOrgId () {
  _orgId++
  return _orgId
}

function getUserObject (id, username) {
  return {
    avatar_url: 'https://avatars.githubusercontent.com/u/' + id + '?v=3',
    events_url: 'https://api.github.com/users/' + username + '/events{/privacy}',
    followers_url: 'https://api.github.com/users/' + username + '/followers',
    following_url: 'https://api.github.com/users/' + username + '/following{/other_user}',
    gists_url: 'https://api.github.com/users/' + username + '/gists{/gist_id}',
    gravatar_id: '',
    html_url: 'https://github.com/' + username + '',
    id: id,
    login: '' + username + '',
    organizations_url: 'https://api.github.com/users/' + username + '/orgs',
    received_events_url: 'https://api.github.com/users/' + username + '/received_events',
    repos_url: 'https://api.github.com/users/' + username + '/repos',
    site_admin: false,
    starred_url: 'https://api.github.com/users/' + username + '/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/' + username + '/subscriptions',
    type: 'User'
  }
}

module.exports = function (orgName, userId, username) {
  orgName = orgName || randStr(5)
  console.log('orgName', orgName)
  console.log('userId', userId)
  console.log('username', username)
  nock('https://api.github.com:443')
    .log(console.log)
    .filteringPath(/\/orgs\/[^\/]+\/members\?.+/, '/orgs/' + orgName + '/members')
    .get('/orgs/' + orgName + '/members')
    .reply(200, [
      getUserObject(userId, username),
      getUserObject(nextOrgId(), randStr(4)),
      getUserObject(nextOrgId(), randStr(5)),
      getUserObject(nextOrgId(), randStr(6)),
      getUserObject(nextOrgId(), randStr(7))
    ], {
      server: 'GitHub.com',
      date: 'Tue, 24 Jun 2014 23:32:26 GMT',
      'content-type': 'application/json charset=utf-8',
      status: '200 OK',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4969',
      'x-ratelimit-reset': '1403655035',
      'cache-control': 'private, max-age=60, s-maxage=60',
      'last-modified': 'Tue, 24 Jun 2014 23:28:16 GMT',
      etag: '"de56a33c6300e03acf0017cad86fd1e7"',
      'x-oauth-scopes': 'read:repo_hook, repo, user:email',
      'x-accepted-oauth-scopes': '',
      vary: 'Accept, Authorization, Cookie, X-GitHub-OTP',
      'x-github-media-type': 'github.v3 format=json',
      'x-xss-protection': '1 mode=block',
      'x-frame-options': 'deny',
      'content-security-policy': "default-src 'none'",
      'content-length': '1158',
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': multiline(function () { /*
        'ETag,
        Link,
        X-GitHub-OTP,
        X-RateLimit-Limit,
        X-RateLimit-Remaining,
        X-RateLimit-Reset,
        X-OAuth-Scopes,
        X-Accepted-OAuth-Scopes,
        X-Poll-Interval'
      */
      }),
      'access-control-allow-origin': '*',
      'x-github-request-id': '62D29D8A:01FC:1054E2A8:53AA0A89',
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'x-served-by': '03d91026ad8428f4d9966d7434f9d82e'
    })
}
