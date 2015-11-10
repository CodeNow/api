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
  getSuccess: {
    url: buildUrlAndPath('actions/analyze/info'),
    headers: defaultHeaders
  }
}
