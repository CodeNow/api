var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var url = require('url');
var uuid = require('uuid');
var join = require('path').join;
var nock = require('nock');

var Context = require('models/mongo/contexts');

describe('Contexts', function () {
  beforeEach(function (done) {
    this.context = new Context();
    this.context.versions.push({});
    this.context.versions[0].files.push({
      Key: join(this.context._id.toString(), 'source', 'file1.txt'),
      ETag: '"' + uuid() + '"',
      VersionId: uuid()
    });
    this.context.versions[0].files.push({
      Key: join(this.context._id.toString(), 'source', 'file2.txt'),
      ETag: '"' + uuid() + '"',
      VersionId: uuid()
    });
    this.context.versions[0].files.push({
      Key: join(this.context._id.toString(), 'source', 'somedir', 'file3.txt'),
      ETag: '"' + uuid() + '"',
      VersionId: uuid()
    });
    this.context.versions[0].files.push({
      Key: join(this.context._id.toString(), 'source', 'somedir', 'anotherdir', 'file4.txt'),
      ETag: '"' + uuid() + '"',
      VersionId: uuid()
    });
    done();
  });
  afterEach(function (done) {
    delete this.context;
    done();
  });

  it('should list the files given the "/" prefix', function (done) {
    var data = this.context.listFiles('latest', '/');
    expect(data).to.have.length(3);
    expect(data[0].Key).to.equal(join(this.context._id.toString(), 'source', 'file1.txt'));
    expect(data[1].Key).to.equal(join(this.context._id.toString(), 'source', 'file2.txt'));
    expect(data[2].Key).to.equal(join(this.context._id.toString(), 'source', 'somedir', '/'));
    expect(data[2].isDir).to.equal(true);
    done();
  });

  it('should list the files given the "/somedir/" prefix', function (done) {
    var data = this.context.listFiles('latest', '/somedir/');
    expect(data).to.have.length(2);
    expect(data[0].Key).to.equal(join(this.context._id.toString(), 'source', 'somedir', 'file3.txt'));
    expect(data[1].Key).to.equal(join(this.context._id.toString(), 'source', 'somedir', 'anotherdir', '/'));
    done();
  });

  it('should error when we try to list files with invalid version id', function (done) {
    var data = this.context.listFiles(uuid(), '/somedir/');
    expect(data).to.have.length(0);
    done();
  });

  it('should respond the list when we pass the latest version id', function (done) {
    var data = this.context.listFiles(this.context.versions[0]._id, '/');
    expect(data).to.have.length(3);
    expect(data[0].Key).to.equal(join(this.context._id.toString(), 'source', 'file1.txt'));
    expect(data[1].Key).to.equal(join(this.context._id.toString(), 'source', 'file2.txt'));
    expect(data[2].Key).to.equal(join(this.context._id.toString(), 'source', 'somedir', '/'));
    done();
  });

  it('should give us the contents of the file using the "latest" keyword', function (done) {
    nock('https://s3.amazonaws.com:443:443')
      .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\/[\.a-zA-Z0-9\/]+\?versionId=[a-f\-0-9]+/,
        '/runnable.context.resources.test/5384d61b3929481461c47060/source/5384d61b3929481461c47060/source/file1.txt' +
        '?versionId=cd0308ae-d827-473a-8ac2-e7fb97a0a56f')
      .get('/runnable.context.resources.test/5384d61b3929481461c47060/source/5384d61b3929481461c47060/source/' +
        'file1.txt?versionId=cd0308ae-d827-473a-8ac2-e7fb97a0a56f')
      .reply(200, 'text');
    this.context.getFile('latest', join(this.context._id.toString(), 'source', 'file1.txt'), function (err, data) {
      if (err) { return done(err); }
      expect(data.Body.toString()).to.equal('text');
      done();
    });
  });

  it('should give us the contents of the file using the latest id', function (done) {
    nock('https://s3.amazonaws.com:443:443')
      .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\/[\.a-zA-Z0-9\/]+\?versionId=[a-f\-0-9]+/,
        '/runnable.context.resources.test/5384d61b3929481461c47060/source/5384d61b3929481461c47060/source/file1.txt' +
        '?versionId=cd0308ae-d827-473a-8ac2-e7fb97a0a56f')
      .get('/runnable.context.resources.test/5384d61b3929481461c47060/source/5384d61b3929481461c47060/source/' +
        'file1.txt?versionId=cd0308ae-d827-473a-8ac2-e7fb97a0a56f')
      .reply(200, 'text');
    this.context.getFile(this.context.versions[0]._id, join(this.context._id.toString(), 'source', 'file1.txt'),
      function (err, data) {
        if (err) { return done(err); }
        expect(data.Body.toString()).to.equal('text');
        done();
      });
  });

  it('should tell us we have a bad version id trying to get a file', function (done) {
    this.context.getFile(uuid(), join(this.context._id.toString(), 'source', 'file1.txt'), function (err) {
      expect(err).to.be.okay;
      expect(err.output.statusCode).to.equal(400);
      expect(err.output.payload.message).to.match(/invalid version id/);
      done();
    });
  });

  it('should tell us we have a bad key trying to get a file', function (done) {
    this.context.getFile(
      'latest',
      join(this.context._id.toString(), 'source', 'notafile.txt'),
      function (err) {
        expect(err).to.be.okay;
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.match(/invalid resource key/);
        done();
      });
  });

  it('should refuse permissions for an incorrect path', function (done) {
    var s3Url = url.format({
      protocol: 's3:',
      slashes: true,
      host: 'runnable.context.resources.test',
      pathname: join('/', 'someFakeId', 'source', 'file.txt')
    });
    expect(this.context.checkPathPermission(s3Url)).to.equal(false);
    done();
  });
});
