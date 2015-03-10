'use strict';

var mongoose = require('mongoose');
var keypather = require('keypather');
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
/*jshint maxcomplexity:20*/
SettingsSchema.pre('save', function (next) {
  var err;
  var usernameMap = keypather.get(this, 'notifications.slack.usernameToSlackNameMap');
  if (usernameMap) {
    Object.keys(usernameMap).forEach(function (username) {
      // If the username or slack name has any non-word character
      if (/\W/.test(username)) {
        err = Boom.badRequest('The username ' + username + ' contains invalid characters');
        err.name = 'ValidationError';
        next(err);
      } else if (/\W/.test(usernameMap[username])) {
        err = Boom.badRequest('Username ' + username + '\'s Slack name contains' +
        ' invalid characters');
        err.name = 'ValidationError';
        next(err);
      }
    })
  }
});

SettingsSchema.index({'owner.github': 1}, {unique: true});

module.exports = SettingsSchema;