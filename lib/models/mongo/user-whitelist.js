'use strict';

var mongoose = require('mongoose');

var UserWhitelistSchema = require('models/mongo/schemas/user-whitelist');

module.exports = mongoose.model('UserWhitelist', UserWhitelistSchema);

