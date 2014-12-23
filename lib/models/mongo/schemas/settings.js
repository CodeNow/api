'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/** @alias module:models/settings */
var Settings = new Schema({
  /** @type Object */
  owner: {
    required: 'Settings require an Owner',
    type: {
      github: {
        type: Number,
        index: { unique: true }
      }
    }
  }
});

module.exports = Settings;