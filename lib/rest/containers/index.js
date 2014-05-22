'use strict';

/**
 * Containers API
 * @module rest/containers
 */

var express = require('express');
var app = module.exports = express();

 // *  @param {object} [query]
 // *  @param {ObjectId} [query.from] ID of the Project from which to copy
 // *  @param {object} body
 // *  @param {string} body.name Name of the project to create
 // *  @param {array.string} body.contexts Array of contexts to create within the project
 // *  @param {string} body.contexts[].name Name of the context to create
 // *  @param {string} body.contexts[].dockerfile Contents of the Dockerfile for the context
 // *  @returns {object} The new project, with NO containers

/** Create a new {@link module:models/container Container}

 *  @event POST rest/containers/
 *  @memberof module:rest/containers
 */
app.post('/',
  )
