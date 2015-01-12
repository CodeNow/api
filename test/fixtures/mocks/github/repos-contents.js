var nock = require('nock');
var defaults = require('defaults');
var multiline = require('multiline');

var repoContentsDirectory = [
  {
    "name": ".gitignore",
    "path": ".gitignore",
    "sha": "c2658d7d1b31848c3b71960543cb0368e56cd4c7",
    "size": 14,
    "url": "https://api.github.com/repos/cflynn07/demo/contents/.gitignore?ref=master",
    "html_url": "https://github.com/cflynn07/demo/blob/master/.gitignore",
    "git_url": "https://api.github.com/repos/cflynn07/demo/git/blobs/c2658d7d1b31848c3b71960543cb0368e56cd4c7",
    "download_url": "https://raw.githubusercontent.com/cflynn07/demo/master/.gitignore",
    "type": "file",
    "_links": {
          "self": "https://api.github.com/repos/cflynn07/demo/contents/.gitignore?ref=master",
          "git": "https://api.github.com/repos/cflynn07/demo/git/blobs/c2658d7d1b31848c3b71960543cb0368e56cd4c7",
          "html": "https://github.com/cflynn07/demo/blob/master/.gitignore"
        }
  },
  {
      "name": "README.md",
      "path": "README.md",
      "sha": "8c1ddfd0210862f0524f859fcf4c47f5d57cd1da",
      "size": 10,
      "url": "https://api.github.com/repos/cflynn07/demo/contents/README.md?ref=master",
      "html_url": "https://github.com/cflynn07/demo/blob/master/README.md",
      "git_url": "https://api.github.com/repos/cflynn07/demo/git/blobs/8c1ddfd0210862f0524f859fcf4c47f5d57cd1da",
      "download_url": "https://raw.githubusercontent.com/cflynn07/demo/master/README.md",
      "type": "file",
      "_links": {
            "self": "https://api.github.com/repos/cflynn07/demo/contents/README.md?ref=master",
            "git": "https://api.github.com/repos/cflynn07/demo/git/blobs/8c1ddfd0210862f0524f859fcf4c47f5d57cd1da",
            "html": "https://github.com/cflynn07/demo/blob/master/README.md"
          }
    },
  {
      "name": "index.js",
      "path": "index.js",
      "sha": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "size": 0,
      "url": "https://api.github.com/repos/cflynn07/demo/contents/index.js?ref=master",
      "html_url": "https://github.com/cflynn07/demo/blob/master/index.js",
      "git_url": "https://api.github.com/repos/cflynn07/demo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "download_url": "https://raw.githubusercontent.com/cflynn07/demo/master/index.js",
      "type": "file",
      "_links": {
            "self": "https://api.github.com/repos/cflynn07/demo/contents/index.js?ref=master",
            "git": "https://api.github.com/repos/cflynn07/demo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
            "html": "https://github.com/cflynn07/demo/blob/master/index.js"
          }
    },
  {
      "name": "jsfile1.js",
      "path": "jsfile1.js",
      "sha": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "size": 0,
      "url": "https://api.github.com/repos/cflynn07/demo/contents/jsfile1.js?ref=master",
      "html_url": "https://github.com/cflynn07/demo/blob/master/jsfile1.js",
      "git_url": "https://api.github.com/repos/cflynn07/demo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "download_url": "https://raw.githubusercontent.com/cflynn07/demo/master/jsfile1.js",
      "type": "file",
      "_links": {
            "self": "https://api.github.com/repos/cflynn07/demo/contents/jsfile1.js?ref=master",
            "git": "https://api.github.com/repos/cflynn07/demo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
        "html": "https://github.com/cflynn07/demo/blob/master/jsfile1.js"
      }
  },
  {
      "name": "jsfile2.js",
      "path": "jsfile2.js",
      "sha": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "size": 0,
      "url": "https://api.github.com/repos/cflynn07/demo/contents/jsfile2.js?ref=master",
      "html_url": "https://github.com/cflynn07/demo/blob/master/jsfile2.js",
      "git_url": "https://api.github.com/repos/cflynn07/demo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "download_url": "https://raw.githubusercontent.com/cflynn07/demo/master/jsfile2.js",
      "type": "file",
      "_links": {
            "self": "https://api.github.com/repos/cflynn07/demo/contents/jsfile2.js?ref=master",
            "git": "https://api.github.com/repos/cflynn07/demo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
            "html": "https://github.com/cflynn07/demo/blob/master/jsfile2.js"
          }
    },
  {
      "name": "jsfile3.js",
      "path": "jsfile3.js",
      "sha": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "size": 0,
      "url": "https://api.github.com/repos/cflynn07/demo/contents/jsfile3.js?ref=master",
      "html_url": "https://github.com/cflynn07/demo/blob/master/jsfile3.js",
      "git_url": "https://api.github.com/repos/cflynn07/demo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "download_url": "https://raw.githubusercontent.com/cflynn07/demo/master/jsfile3.js",
      "type": "file",
      "_links": {
            "self": "https://api.github.com/repos/cflynn07/demo/contents/jsfile3.js?ref=master",
            "git": "https://api.github.com/repos/cflynn07/demo/git/blobs/e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
            "html": "https://github.com/cflynn07/demo/blob/master/jsfile3.js"
          }
    },
  {
      "name": "package.json",
      "path": "package.json",
      "sha": "0561886745192dddc67b9df827744321710934e3",
      "size": 462,
      "url": "https://api.github.com/repos/cflynn07/demo/contents/package.json?ref=master",
      "html_url": "https://github.com/cflynn07/demo/blob/master/package.json",
      "git_url": "https://api.github.com/repos/cflynn07/demo/git/blobs/0561886745192dddc67b9df827744321710934e3",
      "download_url": "https://raw.githubusercontent.com/cflynn07/demo/master/package.json",
      "type": "file",
      "_links": {
            "self": "https://api.github.com/repos/cflynn07/demo/contents/package.json?ref=master",
            "git": "https://api.github.com/repos/cflynn07/demo/git/blobs/0561886745192dddc67b9df827744321710934e3",
            "html": "https://github.com/cflynn07/demo/blob/master/package.json"
          }
    }
];

// jslint max line length
var content = "ewogICJuYW1lIjogImRlbW8iLAogICJ2ZXJzaW9uIjogIjEuMC4wIiwKICAi\n"+
              "ZGVzY3JpcHRpb24iOiAiIiwKICAibWFpbiI6ICJpbmRleC5qcyIsCiAgInNj\n"+
              "cmlwdHMiOiB7CiAgICAidGVzdCI6ICJlY2hvIFwiRXJyb3I6IG5vIHRlc3Qg\n"+
              "c3BlY2lmaWVkXCIgJiYgZXhpdCAxIgogIH0sCiAgInJlcG9zaXRvcnkiOiB7\n"+
              "CiAgICAidHlwZSI6ICJnaXQiLAogICAgInVybCI6ICJodHRwczovL2dpdGh1\n"+
              "Yi5jb20vY2ZseW5uMDcvZGVtby5naXQiCiAgfSwKICAiYXV0aG9yIjogIiIs\n"+
              "CiAgImxpY2Vuc2UiOiAiSVNDIiwKICAiYnVncyI6IHsKICAgICJ1cmwiOiAi\n"+
              "aHR0cHM6Ly9naXRodWIuY29tL2NmbHlubjA3L2RlbW8vaXNzdWVzIgogIH0s\n"+
              "CiAgImhvbWVwYWdlIjogImh0dHBzOi8vZ2l0aHViLmNvbS9jZmx5bm4wNy9k\n"+
              "ZW1vIiwKICAiZGVwZW5kZW5jaWVzIjogewogICAgIm1vbmdvZGIiOiAiXjEu\n"+
              "NC4yNiIKICB9Cn0K\n";
var repoContentsFile = {
  "name": "package.json",
  "path": "package.json",
  "sha": "0561886745192dddc67b9df827744321710934e3",
  "size": 462,
  "url": "https://api.github.com/repos/cflynn07/demo/contents/package.json?ref=master",
  "html_url": "https://github.com/cflynn07/demo/blob/master/package.json",
  "git_url": "https://api.github.com/repos/cflynn07/demo/git/blobs/0561886745192dddc67b9df827744321710934e3",
  "download_url": "https://raw.githubusercontent.com/cflynn07/demo/master/package.json",
  "type": "file",
  "content": content,
  "encoding": "base64",
  "_links": {
      "self": "https://api.github.com/repos/cflynn07/demo/contents/package.json?ref=master",
      "git": "https://api.github.com/repos/cflynn07/demo/git/blobs/0561886745192dddc67b9df827744321710934e3",
      "html": "https://github.com/cflynn07/demo/blob/master/package.json"
    }
};

module.exports.repoContentsDirectory = function (opts) {
  setupMock(repoContentsDirectory, opts);
};

module.exports.repoContentsFile = function (opts) {
  setupMock(repoContentsFile, opts);
};

function setupMock (repoContents, opts) {
  var mockData = repoContents;
  if (opts) {
    mockData = defaults(opts, repoContents);
  }
  var replacePath = '/repos/github_user/github_repo/contents/'+((Array.isArray(repoContents)) ? '' : repoContents.path);
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
      /^\/repos\/[A-z0-9]+\/[A-z0-9]+\/contents\/?([A-z0-9]+)?\/?(.+)?/,
      replacePath
    )
    .get(replacePath)
    .reply(200, mockData, mockHeaders);
}
