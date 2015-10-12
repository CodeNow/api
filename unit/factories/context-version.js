'use strict';

var validation = require('../fixtures/validation')(null);

var ContextVersion = require('models/mongo/context-version');

module.exports = function (opts) {
  return new ContextVersion({
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
};
