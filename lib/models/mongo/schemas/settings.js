'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Mixed = Schema.Mixed;

/** @alias module:models/settings */
var SettingsSchema = new Schema({
  /** @type Object */
  owner: { // Github org
    required: 'Settings require an Owner',
    type: {
      github: {
        type: Number
      }
    }
  },
  // notification settings
  notifications: {
    type: {
      slack: {
        type: {
          authToken: {
            type: String
          },
          usernameToSlackNameMap: {
            type: Mixed // This should be a map of usernames (github) to slack usernames
          }
        }
      },
      hipchat: {
        type: {
          authToken: {
            type: String
          },
          roomId: {
            type: Number
          }
        }
      }
    }
  }
});

SettingsSchema.index({'owner.github': 1}, {unique: true});

module.exports = SettingsSchema;