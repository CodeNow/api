var multiline = require('multiline')
var uuid = require('uuid')
var nock = require('nock')

module.exports = function (email) {
  email = email || uuid() + '@random.net'
  nock('https://api.github.com:443')
    .filteringPath(/\/user\/emails\?.+/, '/user/emails')
    .get('/user/emails')
    .reply(200, [{
      'email': email,
      'primary': false,
      'verified': true
    }, {
      'email': email,
      'primary': true,
      'verified': true
    }], {
      server: 'GitHub.com',
      date: 'Tue, 24 Jun 2014 23:32:27 GMT',
      'content-type': 'application/json charset=utf-8',
      status: '200 OK',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4968',
      'x-ratelimit-reset': '1403655035',
      'cache-control': 'private, max-age=60, s-maxage=60',
      etag: '"02f37bd2d45e8f5cb1a444d08a5d7ff5"',
      'x-oauth-scopes': 'read:repo_hook, repo, user:email',
      'x-accepted-oauth-scopes': 'user, user:email',
      vary: 'Accept, Authorization, Cookie, X-GitHub-OTP',
      'x-github-media-type': 'github.v3',
      'x-xss-protection': '1 mode=block',
      'x-frame-options': 'deny',
      'content-security-policy': "default-src 'none'",
      'content-length': '122',
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': multiline(function () { /*
        ETag,
        Link,
        X-GitHub-OTP,
        X-RateLimit-Limit,
        X-RateLimit-Remaining,
        X-RateLimit-Reset,
        X-OAuth-Scopes,
        X-Accepted-OAuth-Scopes,
        X-Poll-Interval
      */
      }),
      'access-control-allow-origin': '*',
      'x-github-request-id': '62D29D8A:01FF:7E9947E:53AA0A8A',
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'x-served-by': '62a1303ae95931e56e387e87d354bb24'
    })
}
