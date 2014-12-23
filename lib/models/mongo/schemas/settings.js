'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @alias module:models/settings */
var Settings = new Schema({
  /** @type ObjectId */
  owner: {
    required: 'Settings require an Owner',
    type: {
      github: {
        type: Number,
        index: { unique: true }
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    }
  }
});

module.exports = Settings;