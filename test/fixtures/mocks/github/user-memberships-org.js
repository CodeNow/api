'use strict';
var nock = require('nock');

var multiline = require('multiline');

exports.isMember = function (userId, username, orgName) {
  nock('https://api.github.com:443')
    .filteringPath(/\/user\/memberships\/orgs\/[^\/]+\?.+/, '/user/memberships/orgs/' + orgName)
    .get('/user/memberships/orgs/' + orgName)
    .reply(200, {
      'url': 'https://api.github.com/orgs/' + orgName + '/memberships/' + username,
      'state': 'active',
      'role': 'admin',
      'organization_url': 'https://api.github.com/orgs/' + orgName,
      'organization': {
        'login': orgName,
        'url': 'https://api.github.com/orgs/' + orgName,
        'id': 2,
        'repos_url': 'https://api.github.com/users/' + orgName + '/repos',
        'events_url': 'https://api.github.com/users/' + orgName + '/events{/privacy}',
        'members_url': 'https://api.github.com/users/' + orgName + '/members{/member}',
        'public_members_url':
          'https://api.github/com/users/' + orgName + '/public_members{/member}',
        'avatar_url': 'https://secure.gravatar.com/avatar/7ad39074b0584bc555d0417ae3e7d974?'
      },
      'user': {
        'login': username,
        'id': userId,
        'avatar_url': 'https://github.com/images/error/octocat_happy.gif',
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
        'site_admin': false
      }
    }, {
      server: 'GitHub.com',
      date: new Date().toString(),
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
};

exports.pendingMember = function (userId, username, orgName) {
  nock('https://api.github.com:443')
    .filteringPath(/\/user\/memberships\/orgs\/[^\/]+\?.+/, '/user/memberships/orgs/' + orgName)
    .get('/user/memberships/orgs/' + orgName)
    .reply(200, {
      'url': 'https://api.github.com/orgs/' + orgName + '/memberships/' + username,
      'state': 'pending',
      'role': 'admin',
      'organization_url': 'https://api.github.com/orgs/' + orgName,
      'organization': {
        'login': orgName,
        'url': 'https://api.github.com/orgs/' + orgName,
        'id': 2,
        'repos_url': 'https://api.github.com/users/' + orgName + '/repos',
        'events_url': 'https://api.github.com/users/' + orgName + '/events{/privacy}',
        'members_url': 'https://api.github.com/users/' + orgName + '/members{/member}',
        'public_members_url':
          'https://api.github/com/users/' + orgName + '/public_members{/member}',
        'avatar_url': 'https://secure.gravatar.com/avatar/7ad39074b0584bc555d0417ae3e7d974'
      },
      'user': {
        'login': username,
        'id': userId,
        'avatar_url': 'https://github.com/images/error/octocat_happy.gif',
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
        'site_admin': false
      }
    }, {
      server: 'GitHub.com',
      date: new Date().toString(),
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
};

exports.notMember = function (userId, username, orgName) {
  nock('https://api.github.com:443')
    .filteringPath(/\/user\/memberships\/orgs\/[^\/]+\?.+/, '/user/memberships/orgs/' + orgName)
    .get('/user/memberships/orgs/' + orgName)
    .reply(404, {}, {
      server: 'GitHub.com',
      date: new Date().toString(),
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
};
