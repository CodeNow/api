/**
 * @module unit/models/apis/docker
 */
'use strict';
require('loadenv')();

var Code = require('code');
var Lab = require('lab');
var path = require('path');
var sinon = require('sinon');

var Github = require('models/apis/github');

var lab = exports.lab = Lab.script();

var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var moduleName = path.relative(process.cwd(), __filename);

describe('github: '+moduleName, function () {
  describe('_deleteRepoHook', function () {
    it('should return 404 if repo wasnot found', function (done) {
      var github = new Github({token: 'some-token'});
      var err = new Error('Not found');
      err.code = 404;
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(err);
      github._deleteRepoHook(1, 'codenow/api', function (boomErr) {
        expect(boomErr).to.exist();
        expect(boomErr.output.statusCode).to.equal(404);
        expect(boomErr.output.payload.message).to.equal('Github repo hook 1 not found.');
        expect(boomErr.data.err.code).to.equal(err.code);
        expect(boomErr.data.err.message).to.equal(err.message);
        var query = github.repos.deleteHook.getCall(0).args[0];
        expect(query.id).to.equal(1);
        expect(query.user).to.equal('codenow');
        expect(query.repo).to.equal('api');
        done();
      });
    });
    it('should return 502 if some error happened', function (done) {
      var github = new Github({token: 'some-token'});
      var err = new Error('Some error');
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(err);
      github._deleteRepoHook(1, 'codenow/api', function (boomErr) {
        expect(boomErr).to.exist();
        expect(boomErr.output.statusCode).to.equal(502);
        expect(boomErr.output.payload.message).to.equal('Failed to delete github repo hook with id 1');
        expect(boomErr.data.err.message).to.equal(err.message);
        var query = github.repos.deleteHook.getCall(0).args[0];
        expect(query.id).to.equal(1);
        expect(query.user).to.equal('codenow');
        expect(query.repo).to.equal('api');
        done();
      });
    });
    it('should work if no errors occured', function (done) {
      var github = new Github({token: 'some-token'});
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(null, {});
      github._deleteRepoHook(1, 'codenow/api', function (err) {
        expect(err).to.not.exist();
        done();
      });
    });
  });
});
