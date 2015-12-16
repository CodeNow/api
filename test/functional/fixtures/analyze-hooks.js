var url = require('url')

var defaultHeaders = {
  host: process.env.ROOT_DOMAIN,
  accept: '*/*',
  'content-type': 'application/json'
}

function buildUrlAndPath (pathname) {
  return url.format({
    protocol: 'http:',
    slashes: true,
    host: process.env.ROOT_DOMAIN,
    pathname: pathname
  })
}

module.exports = {
  getErrorNoQueryParam: {
    url: buildUrlAndPath('actions/analyze'),
    headers: defaultHeaders
  },
  getSuccess: {
    url: buildUrlAndPath('actions/analyze'),
    qs: {
      repo: 'cflynn07/101'
    },
    headers: defaultHeaders
  }
}
