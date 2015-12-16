var nock = require('nock')

module.exports = function (contextVersion, cb) {
  contextVersion.appCodeVersions.forEach(function (acv) {
    acv = acv.json ? acv.json() : acv
    var splitRepo = acv.repo.split('/')
    var username = splitRepo[0]
    var repo = splitRepo[1]
    var branch = acv.branch
    var fullRepo = username + '/' + repo

    var urlRe = new RegExp('\/repos\/' + username + '\/' + repo + '\/branches\/' + branch + '.*')
    nock('https://api.github.com:443')
      .filteringPath(urlRe, '/repos/' + username + '/' + repo + '/branches/' + branch)
      .get('/repos/' + username + '/' + repo + '/branches/' + branch)
      .reply(200, {
        'name': branch,
        'commit': {
          'sha': '065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac',
          'commit': {
            'author': {
              'name': 'Bryan Kendall',
              'email': 'bryan.a.kendall@gmail.com',
              'date': '2014-08-27T20:09:29Z'
            },
            'committer': {
              'name': 'Bryan Kendall',
              'email': 'bryan.a.kendall@gmail.com',
              'date': '2014-08-27T20:09:29Z'
            },
            'message': 'Update README.md',
            'tree': {
              'sha': 'b7bfaf4b95b99dcb87c66e5be6f0465ab496708e',
              'url': 'https://api.github.com/repos/' + fullRepo + '/git/trees/b7bfaf4b95b99dcb87c66e5be6f0465ab496708e'
            },
            'url': 'https://api.github.com/repos/' + fullRepo + '/git/commits/065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac',
            'comment_count': 0
          },
          'url': 'https://api.github.com/repos/' + fullRepo + '/commits/065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac',
          'html_url': 'https://github.com/' + fullRepo + '/commit/065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac',
          'comments_url': 'https://api.github.com/repos/' + fullRepo + '/commits/065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac/comments',
          'author': {
            'login': 'bkendall',
            'id': 160236,
            'avatar_url': 'https://avatars.githubusercontent.com/u/160236?v=2',
            'gravatar_id': '',
            'url': 'https://api.github.com/users/bkendall',
            'html_url': 'https://github.com/bkendall',
            'followers_url': 'https://api.github.com/users/bkendall/followers',
            'following_url': 'https://api.github.com/users/bkendall/following{/other_user}',
            'gists_url': 'https://api.github.com/users/bkendall/gists{/gist_id}',
            'starred_url': 'https://api.github.com/users/bkendall/starred{/owner}{/repo}',
            'subscriptions_url': 'https://api.github.com/users/bkendall/subscriptions',
            'organizations_url': 'https://api.github.com/users/bkendall/orgs',
            'repos_url': 'https://api.github.com/users/bkendall/repos',
            'events_url': 'https://api.github.com/users/bkendall/events{/privacy}',
            'received_events_url': 'https://api.github.com/users/bkendall/received_events',
            'type': 'User',
            'site_admin': false
          },
          'committer': {
            'login': 'bkendall',
            'id': 160236,
            'avatar_url': 'https://avatars.githubusercontent.com/u/160236?v=2',
            'gravatar_id': '',
            'url': 'https://api.github.com/users/bkendall',
            'html_url': 'https://github.com/bkendall',
            'followers_url': 'https://api.github.com/users/bkendall/followers',
            'following_url': 'https://api.github.com/users/bkendall/following{/other_user}',
            'gists_url': 'https://api.github.com/users/bkendall/gists{/gist_id}',
            'starred_url': 'https://api.github.com/users/bkendall/starred{/owner}{/repo}',
            'subscriptions_url': 'https://api.github.com/users/bkendall/subscriptions',
            'organizations_url': 'https://api.github.com/users/bkendall/orgs',
            'repos_url': 'https://api.github.com/users/bkendall/repos',
            'events_url': 'https://api.github.com/users/bkendall/events{/privacy}',
            'received_events_url': 'https://api.github.com/users/bkendall/received_events',
            'type': 'User',
            'site_admin': false
          },
          'parents': [
            {
              'sha': 'e8849fe5dc09160b63abf23841ccef277afb8f4e',
              'url': 'https://api.github.com/repos/' + fullRepo + '/commits/e8849fe5dc09160b63abf23841ccef277afb8f4e',
              'html_url': 'https://github.com/' + fullRepo + '/commit/e8849fe5dc09160b63abf23841ccef277afb8f4e'
            }
          ]
        },
        '_links': {
          'self': 'https://api.github.com/repos/' + fullRepo + '/branches/' + branch,
          'html': 'https://github.com/' + fullRepo + '/tree/' + branch
        }
      })
  })

  if (cb) {
    cb()
  }
}
