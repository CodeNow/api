var url = require('url');

module.exports = function (cv) {
  var fullRepo = cv ? cv.appCodeVersions[0].repo : '';
  var owner = cv ? fullRepo.split('/')[0] : 'bkendall';
  var repo = cv ? fullRepo.split('/')[1] : 'flaming-octo-nemesis';
  var branch = cv ? cv.appCodeVersions[0].branch : 'master';
  return {
    ping: {
      url: url.format({
        protocol: 'http:',
        slashes: true,
        host: process.env.ROOT_DOMAIN,
        pathname: 'actions/github'
      }),
      headers: {
        host: process.env.ROOT_DOMAIN,
        accept: '*/*',
        'user-agent': 'GitHub Hookshot 3e70583',
        'x-github-event': 'ping',
        'x-github-delivery': 'e05eb1f2-fbc7-11e3-8e1d-423f213c5718',
        'content-type': 'application/json'
      },
      json: {
        zen: 'Encourage flow.',
        hook:
         { url: 'https://api.github.com/repos/' + fullRepo + '/hooks/2472869',
           test_url: 'https://api.github.com/repos/' + fullRepo + '/hooks/2472869/test',
           id: 2472869,
           name: 'web',
           active: true,
           events: [ 'push' ],
           config:
            { secret: process.env.GITHUB_HOOK_SECRET,
              url   : process.env.GITHUB_HOOK_URL,
              content_type: 'json',
              insecure_ssl: '0' },
           last_response: { code: null, status: 'unused', message: null },
           updated_at: '2014-06-24T17:49:23Z',
           created_at: '2014-06-24T17:49:23Z' },
        hook_id: 2472869
      }
    },
    push: {
      url: url.format({
        protocol: 'http:',
        slashes: true,
        host: process.env.ROOT_DOMAIN,
        pathname: 'actions/github'
      }),
      headers: {
        host: process.env.ROOT_DOMAIN,
        accept: '*/*',
        'user-agent': 'GitHub Hookshot 2636b5a',
        'x-github-event': 'push',
        'x-github-delivery': '763c374e-fbc8-11e3-9918-1e687924f7ff',
        'content-type': 'application/json'
      },
      json: {
        ref: 'refs/heads/' + branch,
        after: '7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
        before: 'd5455d9c4fa4c43b3dfdc88e446bb1ec4903fd90',
        created: false,
        deleted: false,
        forced: false,
        compare: 'https://github.com/' + fullRepo + '/compare/d5455d9c4fa4...7caa8452a30d',
        commits: [{
          id: '7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
          distinct: true,
          message: 'updating readme',
          timestamp: '2014-06-24T11:54:07-07:00',
          url: 'https://github.com/' + fullRepo + '/commit/7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
          author: {
            name: 'Bryan Kendall',
            email: 'bryan@runnable.com',
            username: owner
          },
          committer: {
            name: 'Bryan Kendall',
            email: 'bryan@runnable.com',
            username: owner
          },
          added: [],
          removed: [],
          modified: [
            'README.md'
          ]
        }],
        'head_commit': {
          id: '7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
          distinct: true,
          message: 'updating readme',
          timestamp: '2014-06-24T11:54:07-07:00',
          url: 'https://github.com/' + fullRepo + '/commit/7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
          author: {
            name: 'Bryan Kendall',
            email: 'bryan@runnable.com',
            username: owner
          },
          committer: {
            name: 'Bryan Kendall',
            email: 'bryan@runnable.com',
            username: owner
          },
          added: [],
          removed: [],
          modified: [
            'README.md'
          ]
        },
        repository: {
          id: 21174769,
          name: repo,
          full_name: fullRepo,
          url: 'https://github.com/' + fullRepo,
          description: '',
          watchers: 0,
          stargazers: 0,
          forks: 0,
          fork: false,
          size: 0,
          owner: {
            name: owner,
            email: 'bryan.a.kendall@gmail.com'
          },
          'private': false,
          open_issues: 0,
          has_issues: true,
          has_downloads: true,
          has_wiki: true,
          created_at: 1403632014,
          pushed_at: 1403636051,
          master_branch: 'master'
        },
        pusher: {
          name: owner,
          email: 'bryan.a.kendall@gmail.com'
        }
      }
    },
    push_delete: {
      url: url.format({
        protocol: 'http:',
        slashes: true,
        host: process.env.ROOT_DOMAIN,
        pathname: 'actions/github'
      }),
      headers: {
        host: process.env.ROOT_DOMAIN,
        accept: '*/*',
        'user-agent': 'GitHub Hookshot 2636b5a',
        'x-github-event': 'push',
        'x-github-delivery': '763c374e-fbc8-11e3-9918-1e687924f7ff',
        'content-type': 'application/json'
      },
      json: {
        'ref': 'refs/heads/master',
        'before': 'b96798ab32c6f58e05107cfbbda6549f7974d22c',
        'after': '0000000000000000000000000000000000000000',
        'created': false,
        'deleted': true,
        'forced': true,
        'base_ref': null,
        'compare': 'https://github.com/CodeNow/api/compare/b96798ab32c6...000000000000',
        'commits': [

        ],
        'head_commit': null,
        'repository': {
          'id': 20736018,
          'name': 'api',
          'full_name': 'CodeNow/api',
          'owner': {
            'name': 'CodeNow',
            'email': 'live@codenow.com'
          },
          'private': true,
          'html_url': 'https://github.com/CodeNow/api',
          'description': 'dat runnable 2.0 api server',
          'fork': false,
          'url': 'https://github.com/CodeNow/api',
          'forks_url': 'https://api.github.com/repos/CodeNow/api/forks',
          'keys_url': 'https://api.github.com/repos/CodeNow/api/keys{/key_id}',
          'collaborators_url': 'https://api.github.com/repos/CodeNow/api/collaborators{/collaborator}',
          'teams_url': 'https://api.github.com/repos/CodeNow/api/teams',
          'hooks_url': 'https://api.github.com/repos/CodeNow/api/hooks',
          'issue_events_url': 'https://api.github.com/repos/CodeNow/api/issues/events{/number}',
          'events_url': 'https://api.github.com/repos/CodeNow/api/events',
          'assignees_url': 'https://api.github.com/repos/CodeNow/api/assignees{/user}',
          'branches_url': 'https://api.github.com/repos/CodeNow/api/branches{/branch}',
          'tags_url': 'https://api.github.com/repos/CodeNow/api/tags',
          'blobs_url': 'https://api.github.com/repos/CodeNow/api/git/blobs{/sha}',
          'git_tags_url': 'https://api.github.com/repos/CodeNow/api/git/tags{/sha}',
          'git_refs_url': 'https://api.github.com/repos/CodeNow/api/git/refs{/sha}',
          'trees_url': 'https://api.github.com/repos/CodeNow/api/git/trees{/sha}',
          'statuses_url': 'https://api.github.com/repos/CodeNow/api/statuses/{sha}',
          'languages_url': 'https://api.github.com/repos/CodeNow/api/languages',
          'stargazers_url': 'https://api.github.com/repos/CodeNow/api/stargazers',
          'contributors_url': 'https://api.github.com/repos/CodeNow/api/contributors',
          'subscribers_url': 'https://api.github.com/repos/CodeNow/api/subscribers',
          'subscription_url': 'https://api.github.com/repos/CodeNow/api/subscription',
          'commits_url': 'https://api.github.com/repos/CodeNow/api/commits{/sha}',
          'git_commits_url': 'https://api.github.com/repos/CodeNow/api/git/commits{/sha}',
          'comments_url': 'https://api.github.com/repos/CodeNow/api/comments{/number}',
          'issue_comment_url': 'https://api.github.com/repos/CodeNow/api/issues/comments/{number}',
          'contents_url': 'https://api.github.com/repos/CodeNow/api/contents/{+path}',
          'compare_url': 'https://api.github.com/repos/CodeNow/api/compare/{base}...{head}',
          'merges_url': 'https://api.github.com/repos/CodeNow/api/merges',
          'archive_url': 'https://api.github.com/repos/CodeNow/api/{archive_format}{/ref}',
          'downloads_url': 'https://api.github.com/repos/CodeNow/api/downloads',
          'issues_url': 'https://api.github.com/repos/CodeNow/api/issues{/number}',
          'pulls_url': 'https://api.github.com/repos/CodeNow/api/pulls{/number}',
          'milestones_url': 'https://api.github.com/repos/CodeNow/api/milestones{/number}',
          'notifications_url': 'https://api.github.com/repos/CodeNow/api/notifications{?since,all,participating}',
          'labels_url': 'https://api.github.com/repos/CodeNow/api/labels{/name}',
          'releases_url': 'https://api.github.com/repos/CodeNow/api/releases{/id}',
          'created_at': 1402511106,
          'updated_at': '2014-09-25T18:21:37Z',
          'pushed_at': 1411677986,
          'git_url': 'git://github.com/CodeNow/api.git',
          'ssh_url': 'git@github.com:CodeNow/api.git',
          'clone_url': 'https://github.com/CodeNow/api.git',
          'svn_url': 'https://github.com/CodeNow/api',
          'homepage': null,
          'size': 17476,
          'stargazers_count': 3,
          'watchers_count': 3,
          'language': 'JavaScript',
          'has_issues': true,
          'has_downloads': true,
          'has_wiki': true,
          'has_pages': false,
          'forks_count': 0,
          'mirror_url': null,
          'open_issues_count': 12,
          'forks': 0,
          'open_issues': 12,
          'watchers': 3,
          'default_branch': 'master',
          'stargazers': 3,
          'master_branch': 'master',
          'organization': 'CodeNow'
        },
        'pusher': {
          'name': 'bkendall',
          'email': 'bryan.a.kendall@gmail.com'
        },
        'organization': {
          'login': 'CodeNow',
          'id': 2335750,
          'url': 'https://api.github.com/orgs/CodeNow',
          'repos_url': 'https://api.github.com/orgs/CodeNow/repos',
          'events_url': 'https://api.github.com/orgs/CodeNow/events',
          'members_url': 'https://api.github.com/orgs/CodeNow/members{/member}',
          'public_members_url': 'https://api.github.com/orgs/CodeNow/public_members{/member}',
          'avatar_url': 'https://avatars.githubusercontent.com/u/2335750?v=2'
        },
        'sender': {
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
        }
      }
    }
  };
};
