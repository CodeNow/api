var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
// var cleanup = require('middleware/cleanup');
var resMessage = require('middleware/utils').message;

app.get('/',
  me.isModerator,
  // FIXME: do any cleanup we need to do with new setup
  // cleanup.onFirstRun,
  // cleanup.listSavedContainers,
  // cleanup.getOwners,
  // cleanup.cleanupContainersNotIn,
  resMessage('successfuly sent prune request to harbourmaster and cleaned mongodb'));
