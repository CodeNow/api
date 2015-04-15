/**
 * Respond to container-create event from Docker
 * Job created from docker-listener running on a dock
 *  - start the container
 *  - update instance model
 *  - start container
 *  - notifications
 *    - primus org-room broadcast
 *    - slack message
 * @module workers/container-create
 */
'use strict';

module.exports = {};
