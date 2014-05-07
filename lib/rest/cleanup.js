var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var utils = require('middleware/utils');
var containers = require('middleware/containers');
var harbourmaster = require('middleware/harbourmaster');
var parallel = require('middleware-flow').parallel;
var query = require('dat-middleware').query;
var keypather = require('keypather')();
var pluck = require('101/pluck');

var week = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
var unsavedAndVeryOld = {
  saved: false,
  created: {$lte: week}
};

app.get('/',
  me.isModerator,
  query().if('firstRun')
    .then(containers.remove(unsavedAndVeryOld)),
  containers.findSavedOrActive({
    owner: 1,
    servicesToken: 1,
    host: 1,
    containerId: 1
  }),
  containers.getOwnersFor('containers', {
    permission_level: 1,
    _id: 1
  }),
  filterContainersWithRegisteredOwner,
  pluckAndSetContainerIds,
  parallel(
    containers.remove({ _ids: { $nin: 'containerIds' } }),
    harbourmaster.cleanupContainers('containers')
  ),
  utils.message('successfuly sent prune request to harbourmaster and cleaned mongodb'));


function filterContainersWithRegisteredOwner (req, res, next) {
  req.containers = req.containers.containers.filter(function (container) {
    return container.ownerJSON.registered;
  });
  next();
}

function pluckAndSetContainerIds (req, res, next) {
  var containers = req.containers;
  req.containerIds = containers.map(pluck('_id'));
  next();
}