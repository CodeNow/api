var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var users = require('middleware/users');
var cleanup = require('middleware/cleanup');
var utils = require('middleware/utils');

app.get('/',
  me.isModerator,
  cleanup.onFirstRun,
  cleanup.listSavedContainers,
  cleanup.getOwners,
  cleanup.cleanupContainersNotIn,
  utils.message('successfuly sent prune request to harbourmaster and cleaned mongodb'));