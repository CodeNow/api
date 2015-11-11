var nock = require('nock')
var multiline = require('multiline')

module.exports = function (cb) {
  // login page - auto accept
  nock('https://github.com:443')
    .filteringPath(/\/login\?.+/, '/login')
    .get('/login')
    .reply(200, '<html>login form...</html>', {
      'set-cookie': true
    })

  nock('https://github.com:443')
    .filteringPath(/\/login\/oauth\/authorize\?.+/, '/login/oauth/authorize')
    .get('/login/oauth/authorize')
    .reply(200, '<html>login form...</html>')

  // access token DONOT INDENT!
  var tokenResponse = multiline(function () { /*
access_token=9999999999999999999999999999999999999999&scope=read%3Arepo_hook%2Crepo%2Cuser%3Aemail&token_type=bearer
  */
  })
  nock('https://github.com:443')
    .filteringRequestBody(function () {
      return '*'
    })
    .filteringPath(/\/login\/oauth\/access_token.+/, '/login/oauth/access_token')
    .post(
      '/login/oauth/access_token',
      '*')
    .reply(200, tokenResponse, {
      server: 'GitHub.com',
      date: 'Tue, 24 Jun 2014 23:32:25 GMT',
      'content-type': 'application/x-www-form-urlencoded charset=utf-8',
      status: '200 OK',
      'cache-control': 'private, max-age=0, must-revalidate',
      'x-xss-protection': '1 mode=block',
      'x-frame-options': 'deny',
      'content-security-policy': multiline(function () { /*
        default-src *
        script-src assets-cdn.github.com www.google-analytics.com collector-cdn.github.com
        object-src assets-cdn.github.com
        style-src \'self\' \'unsafe-inline\' \'unsafe-eval\' assets-cdn.github.com
        img-src \'self\' data:
          assets-cdn.github.com
          identicons.github.com
          www.google-analytics.com
          collector.githubapp.com
          *.githubusercontent.com
          *.gravatar.com
          *.wp.com
        media-src \'none\'
        frame-src \'self\' render.githubusercontent.com www.youtube.com
        font-src assets-cdn.github.com
        connect-src \'self\' ghconduit.com:25035 live.github.com uploads.github.com s3.amazonaws.com'
      */
      }),
      vary: 'X-PJAX',
      'set-cookie': [multiline(function () { /*
        logged_in=no
        domain=.github.com
        path=/
        expires=Sat, 24-Jun-2034 23:32:25 GMT
        secure
        HttpOnly',
          '_gh_sess=9999999999999999999999999999999999999999999999999999999999999999999999
          99999999999999999999999999999999%3D%3D--33b04d33bc6e556945428bcc116c6a43b2db2598
        path=/ secure HttpOnly
      */
      })],
      etag: '"a4ab5439e04d3a07cfeb781e3a97f4ab"',
      'content-length': '116',
      'x-github-request-id': '62D29D8A:4018:165A0FE4:53AA0A89',
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'x-served-by': '9835a984a05caa405eb61faaa1546741'
    })

  if (cb) { cb() }
}
