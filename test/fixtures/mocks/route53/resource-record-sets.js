'use strict';

var nock = require('nock');

module.exports = function () {
  nock('https://route53.amazonaws.com:443')
    .filteringRequestBody(function() { return '*'; })
    .post('/2013-04-01/hostedzone/FAKE_ROUTE53_HOSTEDZONEID/rrset/', '*')
    .reply(200, function () {
      console.log('wtfwtfwtfwtfwtfwtf')
    });
};