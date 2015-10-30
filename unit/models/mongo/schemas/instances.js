'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var afterEach = lab.afterEach;

var validation = require('../../../fixtures/validation')(lab);
var schemaValidators = require('models/mongo/schemas/schema-validators');
var Hashids = require('hashids');

var Instance = require('models/mongo/instance');
var Version = require('models/mongo/context-version');

var id = 0;
function getNextId () {
  id++;
  return id;
}
function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH);
  return hashids.encrypt(getNextId())[0];
}

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('Instance Schema Isolation Tests: ' + moduleName, function () {
  before(require('../../../fixtures/mongo').connect);
  afterEach(require('../../../../test/functional/fixtures/clean-mongo').removeEverything);


  function createNewVersion (opts) {
    return new Version({
      message: 'test',
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      config: validation.VALID_OBJECT_ID,
      created: Date.now(),
      context: validation.VALID_OBJECT_ID,
      files: [{
        Key: 'test',
        ETag: 'test',
        VersionId: validation.VALID_OBJECT_ID
      }],
      build: {
        dockerImage: 'testing',
        dockerTag: 'adsgasdfgasdf'
      },
      appCodeVersions: [{
        repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        lowerRepo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        branch: opts.branch || 'master',
        commit: 'deadbeef'
      }]
    });
  }

  function createNewInstance (name, opts) {
    opts = opts || {};
    return new Instance({
      name: name || 'name',
      shortHash: getNextHash(),
      locked: opts.locked || false,
      'public': false,
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      build: validation.VALID_OBJECT_ID,
      created: Date.now(),
      contextVersion: createNewVersion(opts),
      container: {
        dockerContainer: opts.containerId || validation.VALID_OBJECT_ID,
        dockerHost: opts.dockerHost || 'http://localhost:4243',
        inspect: {
          State: {
            ExitCode: 0,
            FinishedAt: '0001-01-01T00:00:00Z',
            Paused: false,
            Pid: 889,
            Restarting: false,
            Running: true,
            StartedAt: '2014-11-25T22:29:50.23925175Z'
          }
        }
      },
      containers: [],
      network: {
        hostIp: '1.1.1.100'
      }
    });
  }

  describe('Name Validation', function () {
    validation.NOT_ALPHA_NUM_SAFE.forEach(function (string) {
      it('should fail validation for ' + string, function (done) {
        var instance = createNewInstance();
        instance.name = string;
        validation.errorCheck(
          instance,
          done,
          'name',
          schemaValidators.validationMessages.characters);
      });
    });
    validation.ALPHA_NUM_SAFE.forEach(function (string) {
      it('should succeed validation for ' + string, function (done) {
        var instance = createNewInstance();
        instance.name = string;
        validation.successCheck(instance, done, 'name');
      });
    });
    validation.stringLengthValidationChecking(createNewInstance, 'name', 100);
    validation.requiredValidationChecking(createNewInstance, 'name');
  });

  describe('Github Owner Id Validation', function () {
    validation.githubUserRefValidationChecking(createNewInstance, 'owner.github');
    validation.requiredValidationChecking(createNewInstance, 'owner');
  });

  describe('Github CreatedBy Validation', function () {
    validation.githubUserRefValidationChecking(createNewInstance, 'createdBy.github');
    validation.requiredValidationChecking(createNewInstance, 'createdBy');
  });

  describe('Isoalted Validation', function () {
    validation.objectIdValidationChecking(createNewInstance, 'isolated');
  });
});
