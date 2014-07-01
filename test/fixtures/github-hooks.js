var url = require('url');
var configs = require('../../lib/configs');

module.exports = {
  ping: {
    url: url.format({
      protocol: 'http:',
      slashes: true,
      host: configs.rootDomain,
      pathname: 'actions/github'
    }),
    headers: {
      host: configs.rootDomain,
      accept: '*/*',
      'user-agent': 'GitHub Hookshot 3e70583',
      'x-github-event': 'ping',
      'x-github-delivery': 'e05eb1f2-fbc7-11e3-8e1d-423f213c5718',
      'content-type': 'application/json'
    },
    json: {
      zen: 'Encourage flow.',
      hook:
       { url: 'https://api.github.com/repos/bkendall/flaming-octo-nemesis/hooks/2472869',
         test_url: 'https://api.github.com/repos/bkendall/flaming-octo-nemesis/hooks/2472869/test',
         id: 2472869,
         name: 'web',
         active: true,
         events: [ 'push' ],
         config:
          { secret: '',
            url: 'http://upbris.bryankendall.me:3000/push',
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
      host: configs.rootDomain,
      pathname: 'actions/github'
    }),
    headers: {
      host: configs.rootDomain,
      accept: '*/*',
      'user-agent': 'GitHub Hookshot 2636b5a',
      'x-github-event': 'push',
      'x-github-delivery': '763c374e-fbc8-11e3-9918-1e687924f7ff',
      'content-type': 'application/json'
    },
    json: {
      ref: 'refs/heads/master',
      after: '7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
      before: 'd5455d9c4fa4c43b3dfdc88e446bb1ec4903fd90',
      created: false,
      deleted: false,
      forced: false,
      compare: 'https://github.com/bkendall/flaming-octo-nemesis/compare/d5455d9c4fa4...7caa8452a30d',
      commits: [{
        id: '7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
        distinct: true,
        message: 'updating readme',
        timestamp: '2014-06-24T11:54:07-07:00',
        url: 'https://github.com/bkendall/flaming-octo-nemesis/commit/7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
        author: {
          name: 'Bryan Kendall',
          email: 'bryan@runnable.com',
          username: 'bkendall'
        },
        committer: {
          name: 'Bryan Kendall',
          email: 'bryan@runnable.com',
          username: 'bkendall'
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
        url: 'https://github.com/bkendall/flaming-octo-nemesis/commit/7caa8452a30d2ff0e27e82e43b411ec7e42e2238',
        author: {
          name: 'Bryan Kendall',
          email: 'bryan@runnable.com',
          username: 'bkendall'
        },
        committer: {
          name: 'Bryan Kendall',
          email: 'bryan@runnable.com',
          username: 'bkendall'
        },
        added: [],
        removed: [],
        modified: [
          'README.md'
        ]
      },
      repository: {
        id: 21174769,
        name: 'flaming-octo-nemesis',
        url: 'https://github.com/bkendall/flaming-octo-nemesis',
        description: '',
        watchers: 0,
        stargazers: 0,
        forks: 0,
        fork: false,
        size: 0,
        owner: {
          name: 'bkendall',
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
        name: 'bkendall',
        email: 'bryan.a.kendall@gmail.com'
      }
    }
  }
};
