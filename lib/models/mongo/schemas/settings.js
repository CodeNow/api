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
  ignoredHelpCards: [String],
  // notification settings
  notifications: {
    'default': {
      slack: {
        enabled: true
      }
    },
    type: {
      slack: {
        type: {
          enabled: {
            type: Boolean,
            'default': true
          },
          apiToken: {
            type: String
          },
          githubUsernameToSlackIdMap: {
            type: Mixed // This should be a map of github usernames to slack user ids
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


SettingsSchema.index({
  'owner.github': 1
}, {
  unique: true
});

module.exports = SettingsSchema;