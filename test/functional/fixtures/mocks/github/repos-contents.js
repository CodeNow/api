var nock = require('nock')
var defaults = require('defaults')
var multiline = require('multiline')

/*
var nodejs_repo_dir = require('./repos-contents/nodejs-repo-dir')
var python_repo_dir = require('./repos-contents/python-repo-dir')
var ruby_repo_dir = require('./repos-contents/ruby-repo-dir')

var nodejs_repo_module_file = require('./repos-contents/nodejs-repo-module-file')
var python_repo_module_file = require('./repos-contents/python-repo-module-file')
var ruby_repo_module_file = require('./repos-contents/ruby-repo-module-file')
*/

module.exports.repoContentsDirectory = function (type) {
  setupMock(require('./repos-contents/' + type + '-repo-dir'))
}

module.exports.repoContentsFile = function (type, opts) {
  setupMock(require('./repos-contents/' + type + '-repo-module-file'), opts)
}

function setupMock (repoContents, opts) {
  var mockData = repoContents
  if (opts) {
    mockData = defaults(opts, repoContents)
  }
  var replacePath = '/repos/github_user/github_repo/contents/' + ((Array.isArray(repoContents)) ? '' : repoContents.path)
  var mockHeaders = {
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
  }
  nock('https://api.github.com:443/')
    .filteringPath(
      /^\/repos\/[A-z0-9]+\/[A-z0-9]+\/contents\/?([A-z0-9]+)?\/?(.+)?/,
      replacePath
  )
    .get(replacePath)
    .reply(200, mockData, mockHeaders)
}
