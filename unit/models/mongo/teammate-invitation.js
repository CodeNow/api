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
    function createNewInvite (orgGithubID) {
      return new TeammateInvitation({
        recipient: {
          github: {
            id: validation.VALID_GITHUB_ID,
          },
          email: Faker.Internet.email(),
        },
        createdBy: validation.VALID_OBJECT_ID,
        created: Date.now(),
        organization: {
          github: {
            id: orgGithubID
          }
        }
      });
    }
    var invite1 = createNewInvite(1);
    var invite2 = createNewInvite(2);
    async.series([
      invite1.save.bind(invite1),
      invite2.save.bind(invite2),
    ], done);
  });

  describe('findByGithubOrgName', function () {

    it('should fetch all inivitations within a particular org', function (done) {
      TeammateInvitation.findByGithubOrg(1, function (err, result) {
        if (err) {
          return done(err);
        }
        expect(result).to.have.length(1);
        expect(result[0]).to.be.an.object();
        expect(result[0].organization).to.be.an.object();
        expect(result[0].organization.github).to.be.an.object();
        expect(result[0].organization.github.id).to.equal(1);
        done();
      });
    });

  });

});
