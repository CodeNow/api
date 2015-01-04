var nock = require('nock');
var defaults = require('defaults');
var multiline = require('multiline');

var repo_cflynn07_101 = { id: 22444456,
  name: '101',
  full_name: 'cflynn07/101',
  owner:
   { login: 'cflynn07',
     id: 467885,
     avatar_url: 'https://avatars.githubusercontent.com/u/467885?v=3',
     gravatar_id: '',
     url: 'https://api.github.com/users/cflynn07',
     html_url: 'https://github.com/cflynn07',
     followers_url: 'https://api.github.com/users/cflynn07/followers',
     following_url: 'https://api.github.com/users/cflynn07/following{/other_user}',
     gists_url: 'https://api.github.com/users/cflynn07/gists{/gist_id}',
     starred_url: 'https://api.github.com/users/cflynn07/starred{/owner}{/repo}',
     subscriptions_url: 'https://api.github.com/users/cflynn07/subscriptions',
     organizations_url: 'https://api.github.com/users/cflynn07/orgs',
     repos_url: 'https://api.github.com/users/cflynn07/repos',
     events_url: 'https://api.github.com/users/cflynn07/events{/privacy}',
     received_events_url: 'https://api.github.com/users/cflynn07/received_events',
     type: 'User',
     site_admin: false },
  private: false,
  html_url: 'https://github.com/cflynn07/101',
  description: 'common utils / helpers that can be required selectively',
  fork: true,
  url: 'https://api.github.com/repos/cflynn07/101',
  forks_url: 'https://api.github.com/repos/cflynn07/101/forks',
  keys_url: 'https://api.github.com/repos/cflynn07/101/keys{/key_id}',
  collaborators_url: 'https://api.github.com/repos/cflynn07/101/collaborators{/collaborator}',
  teams_url: 'https://api.github.com/repos/cflynn07/101/teams',
  hooks_url: 'https://api.github.com/repos/cflynn07/101/hooks',
  issue_events_url: 'https://api.github.com/repos/cflynn07/101/issues/events{/number}',
  events_url: 'https://api.github.com/repos/cflynn07/101/events',
  assignees_url: 'https://api.github.com/repos/cflynn07/101/assignees{/user}',
  branches_url: 'https://api.github.com/repos/cflynn07/101/branches{/branch}',
  tags_url: 'https://api.github.com/repos/cflynn07/101/tags',
  blobs_url: 'https://api.github.com/repos/cflynn07/101/git/blobs{/sha}',
  git_tags_url: 'https://api.github.com/repos/cflynn07/101/git/tags{/sha}',
  git_refs_url: 'https://api.github.com/repos/cflynn07/101/git/refs{/sha}',
  trees_url: 'https://api.github.com/repos/cflynn07/101/git/trees{/sha}',
  statuses_url: 'https://api.github.com/repos/cflynn07/101/statuses/{sha}',
  languages_url: 'https://api.github.com/repos/cflynn07/101/languages',
  stargazers_url: 'https://api.github.com/repos/cflynn07/101/stargazers',
  contributors_url: 'https://api.github.com/repos/cflynn07/101/contributors',
  subscribers_url: 'https://api.github.com/repos/cflynn07/101/subscribers',
  subscription_url: 'https://api.github.com/repos/cflynn07/101/subscription',
  commits_url: 'https://api.github.com/repos/cflynn07/101/commits{/sha}',
  git_commits_url: 'https://api.github.com/repos/cflynn07/101/git/commits{/sha}',
  comments_url: 'https://api.github.com/repos/cflynn07/101/comments{/number}',
  issue_comment_url: 'https://api.github.com/repos/cflynn07/101/issues/comments/{number}',
  contents_url: 'https://api.github.com/repos/cflynn07/101/contents/{+path}',
  compare_url: 'https://api.github.com/repos/cflynn07/101/compare/{base}...{head}',
  merges_url: 'https://api.github.com/repos/cflynn07/101/merges',
  archive_url: 'https://api.github.com/repos/cflynn07/101/{archive_format}{/ref}',
  downloads_url: 'https://api.github.com/repos/cflynn07/101/downloads',
  issues_url: 'https://api.github.com/repos/cflynn07/101/issues{/number}',
  pulls_url: 'https://api.github.com/repos/cflynn07/101/pulls{/number}',
  milestones_url: 'https://api.github.com/repos/cflynn07/101/milestones{/number}',
  notifications_url: 'https://api.github.com/repos/cflynn07/101/notifications{?since,all,participating}',
  labels_url: 'https://api.github.com/repos/cflynn07/101/labels{/name}',
  releases_url: 'https://api.github.com/repos/cflynn07/101/releases{/id}',
  created_at: '2014-07-30T20:59:02Z',
  updated_at: '2014-07-08T01:56:52Z',
  pushed_at: '2014-07-15T18:54:57Z',
  git_url: 'git://github.com/cflynn07/101.git',
  ssh_url: 'git@github.com:cflynn07/101.git',
  clone_url: 'https://github.com/cflynn07/101.git',
  svn_url: 'https://github.com/cflynn07/101',
  homepage: null,
  size: 844,
  stargazers_count: 0,
  watchers_count: 0,
  language: null,
  has_issues: false,
  has_downloads: true,
  has_wiki: true,
  has_pages: true,
  forks_count: 0,
  mirror_url: null,
  open_issues_count: 0,
  forks: 0,
  open_issues: 0,
  watchers: 0,
  default_branch: 'master',
  permissions: { admin: true, push: true, pull: true },
  parent:
   { id: 18667134,
     name: '101',
     full_name: 'tjmehta/101',
     owner:
      { login: 'tjmehta',
        id: 640279,
        avatar_url: 'https://avatars.githubusercontent.com/u/640279?v=3',
        gravatar_id: '',
        url: 'https://api.github.com/users/tjmehta',
        html_url: 'https://github.com/tjmehta',
        followers_url: 'https://api.github.com/users/tjmehta/followers',
        following_url: 'https://api.github.com/users/tjmehta/following{/other_user}',
        gists_url: 'https://api.github.com/users/tjmehta/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/tjmehta/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/tjmehta/subscriptions',
        organizations_url: 'https://api.github.com/users/tjmehta/orgs',
        repos_url: 'https://api.github.com/users/tjmehta/repos',
        events_url: 'https://api.github.com/users/tjmehta/events{/privacy}',
        received_events_url: 'https://api.github.com/users/tjmehta/received_events',
        type: 'User',
        site_admin: false },
     private: false,
     html_url: 'https://github.com/tjmehta/101',
     description: 'A modern JS utility library',
     fork: false,
     url: 'https://api.github.com/repos/tjmehta/101',
     forks_url: 'https://api.github.com/repos/tjmehta/101/forks',
     keys_url: 'https://api.github.com/repos/tjmehta/101/keys{/key_id}',
     collaborators_url: 'https://api.github.com/repos/tjmehta/101/collaborators{/collaborator}',
     teams_url: 'https://api.github.com/repos/tjmehta/101/teams',
     hooks_url: 'https://api.github.com/repos/tjmehta/101/hooks',
     issue_events_url: 'https://api.github.com/repos/tjmehta/101/issues/events{/number}',
     events_url: 'https://api.github.com/repos/tjmehta/101/events',
     assignees_url: 'https://api.github.com/repos/tjmehta/101/assignees{/user}',
     branches_url: 'https://api.github.com/repos/tjmehta/101/branches{/branch}',
     tags_url: 'https://api.github.com/repos/tjmehta/101/tags',
     blobs_url: 'https://api.github.com/repos/tjmehta/101/git/blobs{/sha}',
     git_tags_url: 'https://api.github.com/repos/tjmehta/101/git/tags{/sha}',
     git_refs_url: 'https://api.github.com/repos/tjmehta/101/git/refs{/sha}',
     trees_url: 'https://api.github.com/repos/tjmehta/101/git/trees{/sha}',
     statuses_url: 'https://api.github.com/repos/tjmehta/101/statuses/{sha}',
     languages_url: 'https://api.github.com/repos/tjmehta/101/languages',
     stargazers_url: 'https://api.github.com/repos/tjmehta/101/stargazers',
     contributors_url: 'https://api.github.com/repos/tjmehta/101/contributors',
     subscribers_url: 'https://api.github.com/repos/tjmehta/101/subscribers',
     subscription_url: 'https://api.github.com/repos/tjmehta/101/subscription',
     commits_url: 'https://api.github.com/repos/tjmehta/101/commits{/sha}',
     git_commits_url: 'https://api.github.com/repos/tjmehta/101/git/commits{/sha}',
     comments_url: 'https://api.github.com/repos/tjmehta/101/comments{/number}',
     issue_comment_url: 'https://api.github.com/repos/tjmehta/101/issues/comments/{number}',
     contents_url: 'https://api.github.com/repos/tjmehta/101/contents/{+path}',
     compare_url: 'https://api.github.com/repos/tjmehta/101/compare/{base}...{head}',
     merges_url: 'https://api.github.com/repos/tjmehta/101/merges',
     archive_url: 'https://api.github.com/repos/tjmehta/101/{archive_format}{/ref}',
     downloads_url: 'https://api.github.com/repos/tjmehta/101/downloads',
     issues_url: 'https://api.github.com/repos/tjmehta/101/issues{/number}',
     pulls_url: 'https://api.github.com/repos/tjmehta/101/pulls{/number}',
     milestones_url: 'https://api.github.com/repos/tjmehta/101/milestones{/number}',
     notifications_url: 'https://api.github.com/repos/tjmehta/101/notifications{?since,all,participating}',
     labels_url: 'https://api.github.com/repos/tjmehta/101/labels{/name}',
     releases_url: 'https://api.github.com/repos/tjmehta/101/releases{/id}',
     created_at: '2014-04-11T08:14:09Z',
     updated_at: '2015-01-02T03:54:39Z',
     pushed_at: '2014-12-24T05:22:34Z',
     git_url: 'git://github.com/tjmehta/101.git',
     ssh_url: 'git@github.com:tjmehta/101.git',
     clone_url: 'https://github.com/tjmehta/101.git',
     svn_url: 'https://github.com/tjmehta/101',
     homepage: '',
     size: 962,
     stargazers_count: 1320,
     watchers_count: 1320,
     language: 'JavaScript',
     has_issues: true,
     has_downloads: true,
     has_wiki: true,
     has_pages: true,
     forks_count: 52,
     mirror_url: null,
     open_issues_count: 5,
     forks: 52,
     open_issues: 5,
     watchers: 1320,
     default_branch: 'master' },
  source:
   { id: 18667134,
     name: '101',
     full_name: 'tjmehta/101',
     owner:
      { login: 'tjmehta',
        id: 640279,
        avatar_url: 'https://avatars.githubusercontent.com/u/640279?v=3',
        gravatar_id: '',
        url: 'https://api.github.com/users/tjmehta',
        html_url: 'https://github.com/tjmehta',
        followers_url: 'https://api.github.com/users/tjmehta/followers',
        following_url: 'https://api.github.com/users/tjmehta/following{/other_user}',
        gists_url: 'https://api.github.com/users/tjmehta/gists{/gist_id}',
        starred_url: 'https://api.github.com/users/tjmehta/starred{/owner}{/repo}',
        subscriptions_url: 'https://api.github.com/users/tjmehta/subscriptions',
        organizations_url: 'https://api.github.com/users/tjmehta/orgs',
        repos_url: 'https://api.github.com/users/tjmehta/repos',
        events_url: 'https://api.github.com/users/tjmehta/events{/privacy}',
        received_events_url: 'https://api.github.com/users/tjmehta/received_events',
        type: 'User',
        site_admin: false },
     private: false,
     html_url: 'https://github.com/tjmehta/101',
     description: 'A modern JS utility library',
     fork: false,
     url: 'https://api.github.com/repos/tjmehta/101',
     forks_url: 'https://api.github.com/repos/tjmehta/101/forks',
     keys_url: 'https://api.github.com/repos/tjmehta/101/keys{/key_id}',
     collaborators_url: 'https://api.github.com/repos/tjmehta/101/collaborators{/collaborator}',
     teams_url: 'https://api.github.com/repos/tjmehta/101/teams',
     hooks_url: 'https://api.github.com/repos/tjmehta/101/hooks',
     issue_events_url: 'https://api.github.com/repos/tjmehta/101/issues/events{/number}',
     events_url: 'https://api.github.com/repos/tjmehta/101/events',
     assignees_url: 'https://api.github.com/repos/tjmehta/101/assignees{/user}',
     branches_url: 'https://api.github.com/repos/tjmehta/101/branches{/branch}',
     tags_url: 'https://api.github.com/repos/tjmehta/101/tags',
     blobs_url: 'https://api.github.com/repos/tjmehta/101/git/blobs{/sha}',
     git_tags_url: 'https://api.github.com/repos/tjmehta/101/git/tags{/sha}',
     git_refs_url: 'https://api.github.com/repos/tjmehta/101/git/refs{/sha}',
     trees_url: 'https://api.github.com/repos/tjmehta/101/git/trees{/sha}',
     statuses_url: 'https://api.github.com/repos/tjmehta/101/statuses/{sha}',
     languages_url: 'https://api.github.com/repos/tjmehta/101/languages',
     stargazers_url: 'https://api.github.com/repos/tjmehta/101/stargazers',
     contributors_url: 'https://api.github.com/repos/tjmehta/101/contributors',
     subscribers_url: 'https://api.github.com/repos/tjmehta/101/subscribers',
     subscription_url: 'https://api.github.com/repos/tjmehta/101/subscription',
     commits_url: 'https://api.github.com/repos/tjmehta/101/commits{/sha}',
     git_commits_url: 'https://api.github.com/repos/tjmehta/101/git/commits{/sha}',
     comments_url: 'https://api.github.com/repos/tjmehta/101/comments{/number}',
     issue_comment_url: 'https://api.github.com/repos/tjmehta/101/issues/comments/{number}',
     contents_url: 'https://api.github.com/repos/tjmehta/101/contents/{+path}',
     compare_url: 'https://api.github.com/repos/tjmehta/101/compare/{base}...{head}',
     merges_url: 'https://api.github.com/repos/tjmehta/101/merges',
     archive_url: 'https://api.github.com/repos/tjmehta/101/{archive_format}{/ref}',
     downloads_url: 'https://api.github.com/repos/tjmehta/101/downloads',
     issues_url: 'https://api.github.com/repos/tjmehta/101/issues{/number}',
     pulls_url: 'https://api.github.com/repos/tjmehta/101/pulls{/number}',
     milestones_url: 'https://api.github.com/repos/tjmehta/101/milestones{/number}',
     notifications_url: 'https://api.github.com/repos/tjmehta/101/notifications{?since,all,participating}',
     labels_url: 'https://api.github.com/repos/tjmehta/101/labels{/name}',
     releases_url: 'https://api.github.com/repos/tjmehta/101/releases{/id}',
     created_at: '2014-04-11T08:14:09Z',
     updated_at: '2015-01-02T03:54:39Z',
     pushed_at: '2014-12-24T05:22:34Z',
     git_url: 'git://github.com/tjmehta/101.git',
     ssh_url: 'git@github.com:tjmehta/101.git',
     clone_url: 'https://github.com/tjmehta/101.git',
     svn_url: 'https://github.com/tjmehta/101',
     homepage: '',
     size: 962,
     stargazers_count: 1320,
     watchers_count: 1320,
     language: 'JavaScript',
     has_issues: true,
     has_downloads: true,
     has_wiki: true,
     has_pages: true,
     forks_count: 52,
     mirror_url: null,
     open_issues_count: 5,
     forks: 52,
     open_issues: 5,
     watchers: 1320,
     default_branch: 'master' },
  network_count: 52,
  subscribers_count: 1
};

module.exports = function (opts) {
  var mockData = defaults(repo_cflynn07_101, opts||{});
  var replacePath = '/repos/'+mockData.owner.login+'/'+mockData.name;
  var mockHeaders = {
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
  };
  nock('https://api.github.com:443/')
    .filteringPath(
      /^\/repos\/[A-z0-9]+\/[A-z0-9]+\/?\??.+/,
      replacePath
    )
    .get(replacePath)
    .reply(200, mockData, mockHeaders);
};
