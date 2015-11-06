/**
 * @module unit/models/mongo/schemas/teammateInivitation
 */
'use strict';

var Code = require('code');
var Lab = require('lab');
var path = require('path');
var Promise = require('bluebird');

var lab = exports.lab = Lab.script();
var Faker = require('faker');

var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var afterEach = lab.afterEach;
var expect = Code.expect;

var validation = require('../../fixtures/validation')(lab);

var TeammateInvitation = Promise.promisifyAll(require('models/mongo/teammate-invitation'));

var moduleName = path.relative(process.cwd(), __filename);
describe('TeammateInvitation: ' + moduleName, function () {

  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything);

  function createNewInviteAndSave (orgName) {
    var invite = new TeammateInvitation({
      githubUserId: validation.VALID_GITHUB_ID,
      createdBy: validation.VALID_OBJECT_ID,
      created: Date.now(),
      email: Faker.Internet.email(),
      orgName: orgName || 'CodeNow'
    });
    invite = Promise.promisifyAll(invite);
    return invite.save();
  }

  describe('findByGithubOrgName', function () {

    it('should fetch all inivitations within a particular org', function (done) {
      Promise.all([ createNewInviteAndSave('CodeNow'), createNewInviteAndSave('Runnable') ])
        .then(function () {
          return TeammateInvitation.findByGithubOrgNameAsync('Runnable');
        })
        .then(function (result) {
          expect(result).to.have.length(1);
          expect(result[0]).to.be.an.object();
          expect(result[0].orgName).to.be.a.string();
          expect(result[0].orgName).to.equal('Runnable');
          done();
        })
        .catch(done);
    });

  });

});
