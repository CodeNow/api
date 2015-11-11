'use strict'

var nock = require('nock')

module.exports = function (context, filename, cb) {
  nock('https://s3.amazonaws.com:443')
    .post('/runnable.context.resources.test/' + context.id() + '/source/' + filename + '?uploads')
    .reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n<InitiateMultipartUploadResult xmlns=' +
    '"http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>runnable.context.resources.test</Bucket>' +
    '<Key>53f4ea8a3def9169f1ca3f22/source/' + filename + '</Key><UploadId>zDoBF96SgVIWck84pRq3CeDkGlTrQU' +
    'IkMeKAN9EIvfKEBL6rOLSBaJju_w5EKT3ubnvAsgLv2CqVyZSpqk2tAKAtoM5.g2FIybT12MkG8uV38tbHyg79eaZccYEVeMm4' +
    '</UploadId></InitiateMultipartUploadResult>',
      { 'x-amz-id-2': 'NnzVVthWi5jyQTbOLNWkVWJHMSuDREdr1VqOdK9lrlLQBpcOJJAATu7shmmSzs9L',
        'x-amz-request-id': '94C6D17E3B32BBD6',
        date: 'Wed, 20 Aug 2014 18:35:56 GMT',
        'transfer-encoding': 'chunked',
      server: 'AmazonS3' })
  nock('https://s3.amazonaws.com:443')
    .filteringRequestBody(function () { return '*' })
    .filteringPath(/\/runnable\.context\.resources\.test\/[a-f0-9]+\/source\/log-stream\.js\?partNumber=.+/,
      '/runnable.context.resources.test/' + context.id() + '/source/' + filename + '?partNumber=')
    .put('/runnable.context.resources.test/' + context.id() + '/source/' + filename + '?partNumber=', '*')
    .reply(200, '', { 'x-amz-id-2': 'wTyF5nrtfyQxXRuA9dh/UU7KUnAou5Zfhpne142KbO6EhWkJvPD6TKv3RYDwkILs',
      'x-amz-request-id': '20592F4765C75D9B',
      date: 'Wed, 20 Aug 2014 18:12:22 GMT',
      etag: '"fd1e852a58dce3235889b48790c81c51"',
      'content-length': '0',
    server: 'AmazonS3' })
  nock('https://s3.amazonaws.com:443')
    .filteringRequestBody(function () { return '*' })
    .filteringPath(/\/runnable\.context\.resources\.test\/[a-f0-9]+\/source\/log-stream\.js\?.+/,
      '/runnable.context.resources.test/' + context.id() + '/source/' + filename + '?')
    .post('/runnable.context.resources.test/' + context.id() + '/source/' + filename + '?', '*')
    .reply(200, '<?xml version="1.0" encoding="UTF-8"?>\n\n<CompleteMultipartUploadResult xmlns=' +
    '"http://s3.amazonaws.com/doc/2006-03-01/"><Location>https://s3.amazonaws.com/runnable.context.' +
    'resources.test/' + context.id() + '%2Fsource%2F' + filename + '</Location><Bucket>runnable.context.' +
    'resources.test</Bucket><Key>' + context.id() + '/source/' + filename + '</Key><ETag>&quotfb617becf82' +
    '4265cff1e7bbac5d7ba62-1&quot</ETag></CompleteMultipartUploadResult>',
      { 'x-amz-id-2': 'HfQFLN+o35g0kXuJc/HNd5jTMjqy3s6Zk+imEMkOEz3B4eIs3Dap1ExOFg2EMn4M',
        'x-amz-request-id': '6DADF8EBCA65DE86',
        date: 'Wed, 20 Aug 2014 18:24:30 GMT',
        'x-amz-version-id': '5Sae_tebJTYHeDf1thrEl2nw3QPE6VvH',
        'content-type': 'application/xml',
        'transfer-encoding': 'chunked',
      server: 'AmazonS3' })

  if (cb) { cb() }
}
