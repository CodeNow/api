'use strict';

var mongoose = require('mongoose');
var BuildFilesBucket = require('models/apis/build-files');

var InfraCodeVersion = require('models/mongo/schemas/infra-code-version');

InfraCodeVersion.methods.bucket = function () {
  return new BuildFilesBucket(this.context);
};

module.exports = mongoose.model('InfraCodeVersion', InfraCodeVersion);