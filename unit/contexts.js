var url = require('url');

var Context = require('models/contexts');

Lab.describe('Contexts', function () {
  Lab.beforeEach(function (done) {
    this.context = new Context();
    done();
  });
  Lab.afterEach(function (done) {
    delete this.context;
    done();
  });

  Lab.describe('working with context objects', function () {
    Lab.test('should not allow a resource to be uploaded to the wrong bucket', function (done) {
      var s3Url = url.format({
        protocol: 's3:',
        slashes: true,
        host: 'runnable.context.resources.test',
        pathname: '/nottherightid/source/file.txt'
      });
      context.uploadResource(s3Url, 'content', function (err, res) {
        Lab.expect(err);
        Lab.expect(err.code).to.equal(403);
        Lab.expect(err.msg).to.contain('invalid location');
        Lab.expect(res).to.equal(undefined);
        done();
      });
    });

    Lab.test('should give us resource urls for the bucket', function (done) {
      var s3Url = url.format({
        protocol: 's3:',
        slashes: true,
        host: 'runnable.context.resources.test',
        pathname: '/' + context._id.toString() + '/source/file.txt'
      });
      Lab.expect(context.getResourceUrl('file.txt')).to.equal(s3Url);
      done();
    });
  });
});
