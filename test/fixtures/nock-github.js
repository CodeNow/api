var nock = require('nock');
var uuid = require('uuid');
var multiline = require('multiline');

module.exports = function (cb) {
  // login page - auto accept
  nock('https://github.com:443')
    .filteringPath(/\/login\?.+/, '/login')
    .get('/login')
    .reply(200, '<html>login form...</html>', {
      'set-cookie': true
    });

  nock('https://github.com:443')
    .filteringPath(/\/login\/oauth\/authorize\?.+/, '/login/oauth/authorize')
    .get('/login/oauth/authorize')
    .reply(200, '<html>login form...</html>');

  // access token
  var tokenResponse = multiline(function () {/*
  access_token=9999999999999999999999999999999999999999&scope=read%3Arepo_hook%2Crepo%2Cuser%3Aemail&token_type=bearer
  */
  });
  nock('https://github.com:443')
    .filteringRequestBody(function () {
      return '*';
    })
    .filteringPath(/\/login\/oauth\/access_token.+/, '/login/oauth/access_token')
    .post(
      '/login/oauth/access_token',
      '*')
    .reply(200, tokenResponse, {
      server: 'GitHub.com',
      date: 'Tue, 24 Jun 2014 23:32:25 GMT',
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      status: '200 OK',
      'cache-control': 'private, max-age=0, must-revalidate',
      'x-xss-protection': '1; mode=block',
      'x-frame-options': 'deny',
      'content-security-policy': multiline(function () {/*
        default-src *;
        script-src assets-cdn.github.com www.google-analytics.com collector-cdn.github.com;
        object-src assets-cdn.github.com;
        style-src \'self\' \'unsafe-inline\' \'unsafe-eval\' assets-cdn.github.com;
        img-src \'self\' data:
          assets-cdn.github.com
          identicons.github.com
          www.google-analytics.com
          collector.githubapp.com
          *.githubusercontent.com
          *.gravatar.com
          *.wp.com;
        media-src \'none\';
        frame-src \'self\' render.githubusercontent.com www.youtube.com;
        font-src assets-cdn.github.com;
        connect-src \'self\' ghconduit.com:25035 live.github.com uploads.github.com s3.amazonaws.com'
      */
      }),
      vary: 'X-PJAX',
      'set-cookie': [multiline(function () {/*
        logged_in=no;
        domain=.github.com;
        path=/;
        expires=Sat, 24-Jun-2034 23:32:25 GMT;
        secure;
        HttpOnly',
          '_gh_sess=9999999999999999999999999999999999999999999999999999999999999999999999
          99999999999999999999999999999999%3D%3D--33b04d33bc6e556945428bcc116c6a43b2db2598;
        path=/; secure; HttpOnly
      */
      })],
      etag: '"a4ab5439e04d3a07cfeb781e3a97f4ab"',
      'content-length': '116',
      'x-github-request-id': '62D29D8A:4018:165A0FE4:53AA0A89',
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'x-served-by': '9835a984a05caa405eb61faaa1546741'
    });

  // user info
  var randomGithubId = uuid();
  var randomUsername = uuid();
  nock('https://api.github.com:443')
    .filteringPath(/\/user\?.+/, '/user')
    .get('/user')
    .reply(200, {
      "login": randomUsername,
      "id": randomGithubId,
      "avatar_url": "https://avatars.githubusercontent.com/u/"+randomGithubId+"?",
      "gravatar_id": 'wrong',
      "url": "https://api.github.com/users/"+randomUsername,
      "html_url": "https://github.com/"+randomUsername,
      "followers_url": "https://api.github.com/users/"+randomUsername+"/followers",
      "following_url": "https://api.github.com/users/"+randomUsername+"/following{/other_user}",
      "gists_url": "https://api.github.com/users/"+randomUsername+"/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/"+randomUsername+"/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/"+randomUsername+"/subscriptions",
      "organizations_url": "https://api.github.com/users/"+randomUsername+"/orgs",
      "repos_url": "https://api.github.com/users/"+randomUsername+"/repos",
      "events_url": "https://api.github.com/users/"+randomUsername+"/events{/privacy}",
      "received_events_url": "https://api.github.com/users/"+randomUsername+"/received_events",
      "type": "User",
      "site_admin": false,
      "name": randomUsername,
      "company": "",
      "blog": "http://twitter.com/tjmehta",
      "location": "San Francisco",
      "email": "",
      "hireable": true,
      "bio": "",
      "public_repos": 77,
      "public_gists": 8,
      "followers": 17,
      "following": 90,
      "created_at": "2011-02-27T01:20:41Z",
      "updated_at": "2014-06-24T23:28:16Z"
    }, {
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

  // user emails
  nock('https://api.github.com:443')
    .filteringPath(/\/user\/emails\?.+/, '/user/emails')
    .get('/user/emails')
    .reply(200, [{
      "email": uuid()+'@random.net',
      "primary": false,
      "verified": true
    }, {
      "email": uuid()+'@random.net',
      "primary": true,
      "verified": true
    }], {
      server: 'GitHub.com',
      date: 'Tue, 24 Jun 2014 23:32:27 GMT',
      'content-type': 'application/json; charset=utf-8',
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
      'x-xss-protection': '1; mode=block',
      'x-frame-options': 'deny',
      'content-security-policy': 'default-src \'none\'',
      'content-length': '122',
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': multiline(function () {/*
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
    });

  if (cb) { cb(); }
};