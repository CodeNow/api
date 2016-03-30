'use strict'
var uuid = require('uuid')
var randStr = require('randomstring').generate

module.exports = function (userId, username, token) {
  userId = userId || Math.floor(Math.random() * 999999)
  username = username || randStr(5)
  token = token || uuid()
  return {
    'login': username,
    'id': userId,
    'access_token': token,
    'avatar_url': 'https://avatars.githubusercontent.com/u/' + userId + '?',
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
    'site_admin': false,
    'name': username,
    'company': '',
    'blog': 'http://twitter.com/tjmehta',
    'location': 'San Francisco',
    'email': '',
    'hireable': true,
    'bio': '',
    'public_repos': 77,
    'public_gists': 8,
    'followers': 17,
    'following': 90,
    'created_at': '2011-02-27T01:20:41Z',
    'updated_at': '2014-06-24T23:28:16Z'
  }
}
