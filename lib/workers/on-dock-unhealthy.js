/**
 * Respond to dock-unhealty event from docker-listener
 *  - get running containers on dock
 *  - redeploy those containers
 * @module lib/workers/on-dock-unhealthy
 */
'use strict';

require('loadenv')();

var async = require('async');

function onDockUnhealty () {
  async([
      removeDockFromMavis(),
      getRunningContainersOnDock(),
      redeployContainers(),
  ], function (err) {
    if (err) { return nak(err); }
    ack();
  });
}

function getRunningContainersOnDock () {

}

function redeployContainers () {

}
