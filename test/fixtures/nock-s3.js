var nock = require('nock');

module.exports = function () {
  // mock the request to create the source file directory (no files)
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/source\//g,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
    .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
    .reply(200, "");
  // mock the request to create the dockerfile
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/dockerfile\/Dockerfile/g,
      '/runnable.context.resources.test/5358004b171f1c06f8e03197/dockerfile/Dockerfile')
    .filteringRequestBody(function (path) { return '*'; })
    .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/dockerfile/Dockerfile', '*')
    .reply(200, "");
  // for building the project/context
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
      '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
    .get('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile?response-content-type=application%2Fjson')
    .reply(200, "FROM ubuntu");


  //
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\//,
      '/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
    .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
    .reply(200, "");
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
      '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
    .filteringRequestBody(function(path) { return '*'; })
    .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
    .reply(200, "");
  // for building the project/context
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
      '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
    .get('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile?response-content-type=application%2Fjson')
    .reply(200, "FROM ubuntu");
  // for the copy
  nock('https://s3.amazonaws.com:443:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
      '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
    .get('/runnable.context.resources.test?prefix=5358004c171f1c06f8e0319b%2Fsource%2F')
    .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ListBucketResult " +
      "xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Name>runnable.context.resources.test</Name>" +
      "<Prefix>5358004c171f1c06f8e0319b/source/</Prefix><Marker></Marker><MaxKeys>1000</MaxKeys>" +
      "<IsTruncated>false</IsTruncated></ListBucketResult>");
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\?prefix=[0-9a-f]+%2Fsource%2F/,
      '/runnable.context.resources.test?prefix=5358004c171f1c06f8e0319b%2Fsource%2F')
    .get('/runnable.context.resources.test?prefix=5358004c171f1c06f8e0319b%2Fsource%2F')
    .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ListBucketResult xmlns=\"http://" +
      "s3.amazonaws.com/doc/2006-03-01/\"><Name>runnable.context.resources.test</Name><Prefix>" +
      "5358004c171f1c06f8e0319b/source/</Prefix><Marker></Marker><MaxKeys>1000</MaxKeys>" +
      "<IsTruncated>false</IsTruncated><Contents><Key>5358004c171f1c06f8e0319b/source/</Key>" +
      "<LastModified>2014-04-16T21:32:00.000Z</LastModified><ETag>&quot;1&quot;</ETag><Size>0" +
      "</Size><Owner><ID>2</ID><DisplayName>name</DisplayName></Owner><StorageClass>STANDARD" +
      "</StorageClass></Contents></ListBucketResult>");
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\//,
      '/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
    .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
    .reply(200, "");
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
      '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
    .filteringRequestBody(function(path) { return '*'; })
    .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
    .reply(200, "");
};