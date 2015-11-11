var nock = require('nock')

module.exports = function (username, repo, itsThere, cb) {
  var keys = [
    {
      'id': 1,
      'key': 'ssh-rsa AAA...',
      'url': 'https://api.github.com/user/keys/1',
      'title': 'octocat@octomac'
    }
  ]
  if (itsThere) {
    keys.push({
      'id': 2,
      'key': 'ssh-rsa BBB...',
      'url': 'https://api.github.com/user/keys/2',
      'title': 'Runnable-test'
    })
  }
  nock('https://api.github.com:443')
    .filteringPath(/keys\?.+/, 'keys?options')
    .get('/repos/' + username + '/' + repo + '/keys?options')
    .reply(200, keys)

  if (cb) { cb() }
}
