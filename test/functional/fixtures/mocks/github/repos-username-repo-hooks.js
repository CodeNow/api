var nock = require('nock')
var multiline = require('multiline')
var isObject = require('101/is-object')
var hasKeypaths = require('101/has-keypaths')
var find = require('101/find')

module.exports = function (userModel, repoName) {
  if (!isObject(userModel)) {
    throw new TypeError('user must be the user object')
  }
  // assume user model
  var github = userModel.json().accounts.github
  var username = github.login
  var getBody = []

  var urlPath = '\/repos\/' + username + '\/' + repoName + '\/hooks'
  var urlRe = new RegExp(urlPath + '.*')
  nock('https://api.github.com:443')
    .filteringPath(urlRe, urlPath)
    .get(urlPath)
    .reply(200, getBody, {
      server: 'GitHub.com',
      date: new Date().toString(),
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

  nock('https://api.github.com:443')
    .filteringPath(urlRe, urlPath)
    .post(urlPath)
    .reply(201, function (url, requestBody) {
      requestBody = JSON.parse(requestBody)
      if (!requestBody.name) {
        return 'name is required'
      }
      var body = {
        'name': requestBody.name,
        'active': requestBody.active || true,
        'events': requestBody.events || ['push'],
        'config': {
          'url': requestBody.url,
          'content_type': 'json'
        }
      }
      var existing = find(getBody,
        hasKeypaths({ 'config.url': requestBody.url }))
      if (!existing) {
        body.id = 1
        getBody.push(body)
      }
      return body
    }, {
      server: 'GitHub.com',
      date: new Date().toString(),
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

// example item
// {
//   "url": "https://api.github.com/repos/octocat/Hello-World/hooks/1",
//   "updated_at": "2011-09-06T20:39:23Z",
//   "created_at": "2011-09-06T17:26:27Z",
//   "name": "web",
//   "events": [
//     "push",
//     "pull_request"
//   ],
//   "active": true,
//   "config": {
//     "url": "http://example.com",
//     "content_type": "json"
//   },
//   "id": 1
// }
