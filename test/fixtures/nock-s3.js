'use strict';

var nock = require('nock');
var uuid = require('uuid');

module.exports = function () {
  nock.cleanAll();

  /* PUTS */

  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/source\//g,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
    .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
    .twice()
    .reply(200, '', {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    });

  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/source\/Dockerfile/g,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/Dockerfile')
    .filteringRequestBody(function () { return '*'; })
    .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/Dockerfile', '*')
    .twice()
    .reply(200, '', {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    });

  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\/newfile\.txt/,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/newfile.txt')
    .filteringRequestBody(function () { return '*'; })
    .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/newfile.txt', '*')
    .reply(200, '', {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    });

  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\/file\.txt/,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/file.txt')
    .filteringRequestBody(function () { return '*'; })
    .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/file.txt', '*')
    .reply(200, '', {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    });

  /* GETS */

  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\/Dockerfile\?versionId=.+/,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/Dockerfile')
    .get('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/Dockerfile')
    .reply(200, "FROM ubuntu");

  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\/\?versionId=.+/,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
    .get('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
    .reply(200, "");

  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/source\/file\.txt\?versionId=.+/,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/file.txt')
    .get('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/file.txt')
    .reply(200, "here is some content for the file file.txt");

  /* DELETES */

  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/source\/file\.txt/,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/file.txt')
    .delete('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/file.txt')
    .reply(200, "", {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    });

};
