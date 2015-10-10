'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @alias module:models/instance */
var NetworkSchema = new Schema({
  /** @type ObjectId */
  owner: {
    required: 'Instances require an Owner',
    type: {
      github: {
        type: Number,
        index: {
          unique: true
        }
      // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    }
  },
  ip: {
    type: String,
    index: {
      unique: true
    }
  }
});

module.exports = NetworkSchema;