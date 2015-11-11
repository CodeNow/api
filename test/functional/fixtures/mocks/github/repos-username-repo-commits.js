var nock = require('nock')
var multiline = require('multiline')

module.exports = function (username, repoName, commit, committerName) {
  committerName = committerName || username
  var getBody = {
    'url': 'https://api.github.com/repos/' + username + '/' + repoName + '/commits/' + commit + '',
    'sha': '' + commit + '',
    'html_url': 'https://github.com/' + username + '/' + repoName + '/commit/' + commit + '',
    'comments_url': 'https://api.github.com/repos/' + username + '/' + repoName + '/commits/' + commit + '/comments',
    'commit': {
      'url': 'https://api.github.com/repos/' + username + '/' + repoName + '/git/commits/' + commit + '',
      'author': {
        'name': 'Monalisa Octocat',
        'email': 'support@github.com',
        'date': '2011-04-14T16:00:49Z'
      },
      'committer': {
        'name': 'Monalisa Octocat',
        'email': 'support@github.com',
        'date': '2011-04-14T16:00:49Z'
      },
      'message': 'Fix all the bugs',
      'tree': {
        'url': 'https://api.github.com/repos/' + username + '/' + repoName + '/tree/' + commit + '',
        'sha': '' + commit + ''
      },
      'comment_count': 0
    },
    'author': {
      'login': committerName, // 'octocat',
      'id': 1,
      'avatar_url': 'https://github.com/images/error/octocat_happy.gif',
      'gravatar_id': '',
      'url': 'https://api.github.com/users/' + committerName + '',
      'html_url': 'https://github.com/' + committerName + '',
      'followers_url': 'https://api.github.com/users/' + committerName + '/followers',
      'following_url': 'https://api.github.com/users/' + committerName + '/following{/other_user}',
      'gists_url': 'https://api.github.com/users/' + committerName + '/gists{/gist_id}',
      'starred_url': 'https://api.github.com/users/' + committerName + '/starred{/owner}{/repo}',
      'subscriptions_url': 'https://api.github.com/users/' + committerName + '/subscriptions',
      'organizations_url': 'https://api.github.com/users/' + committerName + '/orgs',
      'repos_url': 'https://api.github.com/users/' + committerName + '/repos',
      'events_url': 'https://api.github.com/users/' + committerName + '/events{/privacy}',
      'received_events_url': 'https://api.github.com/users/' + committerName + '/received_events',
      'type': 'User',
      'site_admin': false
    },
    'committer': {
      'login': committerName, // 'octocat',
      'id': 1,
      'avatar_url': 'https://github.com/images/error/octocat_happy.gif',
      'gravatar_id': '',
      'url': 'https://api.github.com/users/' + committerName + '',
      'html_url': 'https://github.com/' + committerName + '',
      'followers_url': 'https://api.github.com/users/' + committerName + '/followers',
      'following_url': 'https://api.github.com/users/' + committerName + '/following{/other_user}',
      'gists_url': 'https://api.github.com/users/' + committerName + '/gists{/gist_id}',
      'starred_url': 'https://api.github.com/users/' + committerName + '/starred{/owner}{/repo}',
      'subscriptions_url': 'https://api.github.com/users/' + committerName + '/subscriptions',
      'organizations_url': 'https://api.github.com/users/' + committerName + '/orgs',
      'repos_url': 'https://api.github.com/users/' + committerName + '/repos',
      'events_url': 'https://api.github.com/users/' + committerName + '/events{/privacy}',
      'received_events_url': 'https://api.github.com/users/' + committerName + '/received_events',
      'type': 'User',
      'site_admin': false
    },
    'parents': [
      {
        'url': 'https://api.github.com/repos/' + username + '/' + repoName + '/commits/' + commit + '',
        'sha': '' + commit + ''
      }
    ],
    'stats': {
      'additions': 104,
      'deletions': 4,
      'total': 108
    },
    'files': [
      {
        'filename': 'file1.txt',
        'additions': 10,
        'deletions': 2,
        'changes': 12,
        'status': 'modified',
        'raw_url': 'https://github.com/' + username + '/' + repoName +
          '/raw/7ca483543807a51b6079e54ac4cc392bc29ae284/file1.txt',
        'blob_url': 'https://github.com/' + username + '/' + repoName +
          '/blob/7ca483543807a51b6079e54ac4cc392bc29ae284/file1.txt',
        'patch': '@@ -29,7 +29,7 @@\n.....'
      }
    ]
  }

  var urlPath = '\/repos\/' + username + '\/' + repoName + '\/commits\/' + commit + '?'
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
  return getBody
}
