'use strict';

var extend = require('lodash').extend;
var BaseSchema = require('./base');
var Schema = require('mongoose').Schema;
var ObjectId = Schema.ObjectId;

var InfraCodeVersionSchema = new Schema({
  /* Currently infrastructure code is tied to a context, in the future it could
   * be tied to an infrastructure with some name like api-infrastructure.
   */
  /***
   * @type: ObjectId
   **/
  context: {
    type: ObjectId
  },
  /* s3 file versions */
  files: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String
    }],
    'default': []
  }
});

extend(InfraCodeVersionSchema.methods, BaseSchema.methods);
extend(InfraCodeVersionSchema.statics, BaseSchema.statics);

module.exports = InfraCodeVersionSchema;