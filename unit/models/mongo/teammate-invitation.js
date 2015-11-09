/**
 * @module unit/models/mongo/schemas/teammateInivitation
 */
'use strict';

var Code = require('code');
var Lab = require('lab');
var path = require('path');
var async = require('async');

var lab = exports.lab = Lab.script();
var Faker = require('faker');

var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var expect = Code.expect;

var validation = require('../../fixtures/validation')(lab);

var TeammateInvitation = require('models/mongo/teammate-invitation');

var moduleName = path.relative(process.cwd(), __filename);
describe('TeammateInvitation: ' + moduleName, function () {

  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything);

  beforeEach(function (done) {
    function createNewInvite (orgName) {
      return new TeammateInvitation({
        githubUserId: validation.VALID_GITHUB_ID,
        createdBy: validation.VALID_OBJECT_ID,
        created: Date.now(),
        email: Faker.Internet.email(),
        orgName: orgName || 'CodeNow'
      });
    }
    var runnableInvite = createNewInvite('Runnable');
    var codeNowInvite = createNewInvite('CodeNow');
    async.series([
      runnableInvite.save.bind(runnableInvite),
      codeNowInvite.save.bind(codeNowInvite),
    ], done);
  });

  describe('findByGithubOrgName', function () {

    it('should fetch all inivitations within a particular org', function (done) {
      TeammateInvitation.findByGithubOrgName('Runnable', function (err, result) {
        if (err) {
          done(err);
        }
        expect(result).to.have.length(1);
        expect(result[0]).to.be.an.object();
        expect(result[0].orgName).to.be.a.string();
        expect(result[0].orgName).to.equal('Runnable');
        done();
      });
    });

  });

});
