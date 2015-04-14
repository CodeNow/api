/**
 * Worker
 * Respond to container-create event from Docker
 * Job created from docker-listener running on a dock
 *  - Update instance model
 *  - Start container
 *  - Notifications
 *    - slack message
 * @module workers/container-create
 */
'use strict'
