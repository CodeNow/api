'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;

module.exports = new Schema({
  owner: {
    type: ObjectId,
    index: true,
    required: 'Environments require an Owner',
    validate : validators.objectId({model:"Environment", literal: "Owner"})
  },
  name: {
    type: String,
    required: 'Environments require a name',
    validate : validators.alphaNumName({model:"Environment", literal: "Name"})
  }
});