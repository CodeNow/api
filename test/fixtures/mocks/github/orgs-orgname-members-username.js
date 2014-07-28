var nock = require('nock');
var multiline = require('multiline');

module.exports = function (orgname, username, code, orgId) {
  // 204 if requester is an organization member and user is a member
  // 404 if requester is an organization member and user is not a member
  // 404 if requester is not an organization member and is inquiring about themselves
  // 302 if requester is not an organization member
  var status;
  if (code === 204) {
    status = '204 Found';
  } else if (code === 302) {
    status = '302 Found';
  } else if (code === 404) {
    status = '404 Not Found';
  } else {
    console.error('STATUS NOT SET IN ORGS-ORGNAME-MEMBERS-USERNAME');
  }
  nock('https://api.github.com:443')
    .filteringPath(/\/orgs\/[^\/]+\/members\/[^\/]+\?.+/, '/orgs/' + orgname + '/members/' + username)
    .get('/orgs/' + orgname + '/members/' + username)
    .reply(code, {}, {
      server: 'GitHub.com',
      date: new Date().toString(),
      'content-type': 'application/json; charset=utf-8',
      status: status,
      location: 'https://api.github.com/organizations/' + orgId + '/public_members/' + username,
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
};
