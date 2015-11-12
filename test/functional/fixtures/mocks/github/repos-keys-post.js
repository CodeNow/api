var nock = require('nock')

module.exports = function (username, repo, cb) {
  // HOOKS
  nock('https://api.github.com:443')
    .filteringPath(/keys\?.+/, 'keys?options')
    .filteringRequestBody(function () {
      return '*'
    })
    .post('/repos/' + username + '/' + repo + '/keys?options', '*')
    .reply(200, [
      {
        'id': 1,
        'key': 'ssh-rsa AAA...',
        'url': 'https://api.github.com/user/keys/1',
        'title': 'octocat@octomac'
      }
    ])

  if (cb) { cb() }
}
