var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');

var Project = require('models/mongo/project');

describe('Projects', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  var sampleEnvironment = {
    name: 'enviroName',
    owner: validation.VALID_OBJECT_ID
  };

  function createNewProject() {
    return new Project({
      name: 'name',
      description: 'description',
      public: false,
      owner: { github: validation.VALID_GITHUB_ID },
      created: Date.now(),
      environment: [sampleEnvironment],
      defaultEnvironment: validation.VALID_OBJECT_ID
    });
  }

  it('should be able to save a project!', function (done) {
    var project = createNewProject();
    project.save(function (err, project) {
      if (err) { done(err); }
      else {
        expect(project).to.be.okay;
        done();
      }
    });
  });
  describe('Projects Name Validation', function () {
    validation.NOT_ALPHA_NUM_SAFE.forEach(function (string) {
      it('Name should fail validation for ' + string, function (done) {
        var project = createNewProject();
        project.name = string;
        validation.errorCheck(project, done, 'name', schemaValidators.validationMessages.characters);
      });
    });
    validation.ALPHA_NUM_NOSPACE_SAFE.forEach(function (string) {
      it('Name should succeed validation for ' + string, function (done) {
        var project = createNewProject();
        project.name = string;
        validation.successCheck(project, done, 'name');
      });
    });
    validation.stringLengthValidationChecking(createNewProject, 'name', 100);

    validation.requiredValidationChecking(createNewProject, 'name');
  });

  describe('Project Github User Id Owner Validation', function () {
    validation.githubUserRefValidationChecking(createNewProject, 'owner.github');
  });

  describe('Project Default Environment Validation', function () {
    validation.objectIdValidationChecking(createNewProject, 'defaultEnvironment');
    validation.requiredValidationChecking(createNewProject, 'defaultEnvironment');
  });
});
