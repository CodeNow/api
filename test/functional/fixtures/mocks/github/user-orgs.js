var nock = require('nock');
var multiline = require('multiline');
var keypather = require('keypather')();
var randStr = require('randomstring').generate;

var _orgId = 1000; // these should not intersect with github user-ids
function nextOrgId () {
  _orgId++;
  return _orgId;
}

module.exports = function (userObject, orgId, orgName) {
  if (arguments.length === 2) {
    orgName = orgId;
    orgId = userObject;
    userObject = {};
  }
  var token = keypather.get(userObject, 'accounts.github.access_token') ||
    keypather.get(userObject, 'attrs.accounts.github.access_token');
  orgName = orgName || randStr(5);
  orgId = orgId || nextOrgId();
  var n = nock('https://api.github.com:443');
  if (token) {
    n = n.get('/user/orgs?access_token=' + token);
  } else {
    n = n.filteringPath(/\/user\/orgs\?.+/, '/user/orgs')
      .get('/user/orgs');
  }
  n.reply(200, [
    {
      login: orgName,
      id: orgId,
      url: 'https://api.github.com/orgs/github',
      'avatar_url': 'https://github.com/images/error/octocat_happy.gif' // eslint-disable-line quote-props
    }
  ], {
    server: 'GitHub.com',
    date: 'Tue, 24 Jun 2014 23:32:26 GMT',
    'content-type': 'application/json; charset=utf-8',
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
    'x-github-media-type': 'github.v3; format=json',
    'x-xss-protection': '1; mode=block',
    'x-frame-options': 'deny',
    'content-security-policy': 'default-src \'none\'',
    'content-length': '1158',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': multiline(function () {/*
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
  });
  return {
    orgName: orgName,
    orgId: orgId
  };
};
