var url = require('url');

module.exports = function () {
  return {
    getErrorMissingQuery: {
      url: url.format({
        protocol: 'http:',
        slashes: true,
        host: process.env.ROOT_DOMAIN,
        pathname: 'actions/analyze'
      }),
      headers: {
        host: process.env.ROOT_DOMAIN,
        accept: '*/*',
        'user-agent': 'GitHub Hookshot 3e70583',
        'x-github-event': 'ping',
        'x-github-delivery': 'e05eb1f2-fbc7-11e3-8e1d-423f213c5718',
        'content-type': 'application/json'
      }
    }
  };
};
