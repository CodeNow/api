var nock = require('nock')
var multiline = require('multiline')
var isObject = require('101/is-object')

var memo = {}
var id = 0
function getRepoId (repoName) {
  var repoId = memo[repoName]
  if (!repoId) {
    repoId = id
    id++
  }
  return repoId
}

module.exports = function (userModel, repoName) {
  var userId
  var username
  var repoId
  if (arguments.length === 2) {
    if (!isObject(userModel)) {
      throw new TypeError('user must be the user object')
    }
    // assume user model
    var github = userModel.json().accounts.github
    userId = github.id
    username = github.login
    repoId = getRepoId(repoName)
  } else {
    userId = arguments[0]
    username = arguments[1]
    repoName = arguments[2]
    repoId = getRepoId(repoName)
  }

  var urlRe = new RegExp('\/repos\/' + username + '\/' + repoName + '.*')
  nock('https://api.github.com:443')
    .filteringPath(urlRe, '/repos/' + username + '/' + repoName)
    .get('/repos/' + username + '/' + repoName)
    .reply(200, {
      'id': repoId,
      'owner': {
        'login': username,
        'id': userId,
        'avatar_url': 'https://github.com/images/error/' + username + '_happy.gif',
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
      },
      'name': repoName,
      'full_name': username + '/' + repoName,
      'description': 'This your first repo!',
      'private': false,
      'fork': false,
      'url': 'https://api.github.com/repos/' + username + '/' + repoName,
      'html_url': 'https://github.com/' + username + '/' + repoName,
      'clone_url': 'https://github.com/' + username + '/' + repoName + '.git',
      'git_url': 'git://github.com/' + username + '/' + repoName + '.git',
      'ssh_url': 'git@github.com:' + username + '/' + repoName + '.git',
      'svn_url': 'https://svn.github.com/' + username + '/' + repoName,
      'mirror_url': 'git://git.example.com/' + username + '/' + repoName,
      'homepage': 'https://github.com',
      'language': null,
      'forks_count': 9,
      'stargazers_count': 80,
      'watchers_count': 80,
      'size': 108,
      'default_branch': 'master',
      'open_issues_count': 0,
      'has_issues': true,
      'has_wiki': true,
      'has_downloads': true,
      'pushed_at': '2011-01-26T19:06:43Z',
      'created_at': '2011-01-26T19:01:12Z',
      'updated_at': '2011-01-26T19:14:43Z',
      'permissions': {
        'admin': false,
        'push': false,
        'pull': true
      },
      'subscribers_count': 42,
      'organization': {
        'login': username,
        'id': userId,
        'avatar_url': 'https://github.com/images/error/' + username + '_happy.gif',
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
        'type': 'Organization',
        'site_admin': false
      },
      'parent': {
        'id': repoId,
        'owner': {
          'login': username,
          'id': userId,
          'avatar_url': 'https://github.com/images/error/' + username + '_happy.gif',
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
        },
        'name': repoName,
        'full_name': username + '/' + repoName,
        'description': 'This your first repo!',
        'private': false,
        'fork': true,
        'url': 'https://api.github.com/repos/' + username + '/' + repoName,
        'html_url': 'https://github.com/' + username + '/' + repoName,
        'clone_url': 'https://github.com/' + username + '/' + repoName + '.git',
        'git_url': 'git://github.com/' + username + '/' + repoName + '.git',
        'ssh_url': 'git@github.com:' + username + '/' + repoName + '.git',
        'svn_url': 'https://svn.github.com/' + username + '/' + repoName,
        'mirror_url': 'git://git.example.com/' + username + '/' + repoName,
        'homepage': 'https://github.com',
        'language': null,
        'forks_count': 9,
        'stargazers_count': 80,
        'watchers_count': 80,
        'size': 108,
        'default_branch': 'master',
        'open_issues_count': 0,
        'has_issues': true,
        'has_wiki': true,
        'has_downloads': true,
        'pushed_at': '2011-01-26T19:06:43Z',
        'created_at': '2011-01-26T19:01:12Z',
        'updated_at': '2011-01-26T19:14:43Z',
        'permissions': {
          'admin': false,
          'push': false,
          'pull': true
        }
      },
      'source': {
        'id': repoId,
        'owner': {
          'login': username,
          'id': userId,
          'avatar_url': 'https://github.com/images/error/' + username + '_happy.gif',
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
        },
        'name': repoName,
        'full_name': username + '/' + repoName,
        'description': 'This your first repo!',
        'private': false,
        'fork': true,
        'url': 'https://api.github.com/repos/' + username + '/' + repoName,
        'html_url': 'https://github.com/' + username + '/' + repoName,
        'clone_url': 'https://github.com/' + username + '/' + repoName + '.git',
        'git_url': 'git://github.com/' + username + '/' + repoName + '.git',
        'ssh_url': 'git@github.com:' + username + '/' + repoName + '.git',
        'svn_url': 'https://svn.github.com/' + username + '/' + repoName,
        'mirror_url': 'git://git.example.com/' + username + '/' + repoName,
        'homepage': 'https://github.com',
        'language': null,
        'forks_count': 9,
        'stargazers_count': 80,
        'watchers_count': 80,
        'size': 108,
        'default_branch': 'master',
        'open_issues_count': 0,
        'has_issues': true,
        'has_wiki': true,
        'has_downloads': true,
        'pushed_at': '2011-01-26T19:06:43Z',
        'created_at': '2011-01-26T19:01:12Z',
        'updated_at': '2011-01-26T19:14:43Z',
        'permissions': {
          'admin': false,
          'push': false,
          'pull': true
        }
      }
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
