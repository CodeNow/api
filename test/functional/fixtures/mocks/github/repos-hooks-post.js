var nock = require('nock')

module.exports = function (username, repo, cb) {
  nock('https://api.github.com:443')
    .filteringPath(/hooks\?.+/, 'hooks?access_token')
    .filteringRequestBody(function () {
      return '*'
    })
    .post('/repos/' + username + '/' + repo + '/hooks?access_token', '*')
    .reply(201, {
      'url': 'https://api.github.com/repos/octocat/Hello-World/hooks/1',
      'updated_at': '2011-09-06T20:39:23Z',
      'created_at': '2011-09-06T17:26:27Z',
      'name': 'web',
      'events': [
        'push',
        'pull_request'
      ],
      'active': true,
      'config': {
        'url': 'http://example.com',
        'content_type': 'json'
      },
      'id': 1
    })

  if (cb) { cb() }
}
