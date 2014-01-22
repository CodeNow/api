var express = require('express');
var app = module.exports = express();
var users = require('../middleware/users');
var cleanup = require('../middleware/cleanup');
var utils = require('../middleware/utils');

app.get('/',
  users.fetchSelf,
  users.isModerator,
  cleanup.onFirstRun,
  cleanup.listSavedContainers,
  cleanup.getOwners,
  cleanup.cleanupContainersNotIn,
  utils.message('successfuly sent prune request to harbourmaster and cleaned mongodb'));