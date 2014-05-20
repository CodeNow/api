var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var url = require('url');
var join = require('path').join;

var Context = require('models/contexts');

describe('Contexts', function () {
  beforeEach(function (done) {
    this.context = new Context();
    done();
  });
  afterEach(function (done) {
    delete this.context;
    done();
  });

  it('should not allow a resource to be uploaded to the wrong bucket', function (done) {
    var s3Url = url.format({
      protocol: 's3:',
      slashes: true,
      host: 'runnable.context.resources.test',
      pathname: '/nottherightid/source/file.txt'
    });
    this.context.uploadResource(s3Url, 'content', function (err, res) {
      expect(err);
      expect(err.code).to.equal(403);
      expect(err.msg).to.contain('invalid location');
      expect(res).to.equal(undefined);
      done();
    });
  });

  it('should give us resource urls for the bucket', function (done) {
    var s3Url = url.format({
      protocol: 's3:',
      slashes: true,
      host: 'runnable.context.resources.test',
      pathname: join('/', this.context._id.toString(), 'source', 'file.txt')
    });
    expect(this.context.getResourceUrl('file.txt')).to.equal(s3Url);
    done();
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
