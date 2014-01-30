var body = require('middleware/body');
var query = require('middleware/query');
var utils = require('middleware/utils');
var implementations = require('middleware/implementations');
var specifications = require('middleware/specifications');
var series = utils.series;
var express = require('express');

var app = module.exports = express();

app.post('/',
  body.pickAndRequire(
    'implements',
    'containerId',
    'requirements',
    'subdomain'),
  body.isObjectId('implements'),
  body.isObjectId64('containerId'),
  body.set('owner', 'user_id'),
  implementations.create('body'),
  implementations.model.save(),
  implementations.respond);

// TODO: this should really return an array
// but currently frontend expects single impl
app.get('/',
  query.pick('implements'),
  query.set('owner', 'user_id'),
  query.if('implements', // if implements is supplied, does find one
    query.isObjectId('implements'),
    implementations.findOne('query'),
    implementations.respond),
  implementations.find('query'),
  implementations.respond);

// TODO: dockworker update
var updateImplementation = series(
  implementations.findById('params.implementationId'),
  implementations.checkFound,
  body.pick('containerId', 'requirements'),
  // body.if('containerId', // TODO
  //   dockworker.updateEnv)
  body.set('owner', 'user_id'),
  implementations.model.set('body'),
  implementations.model.save(),
  implementations.respond
);

app.put('/:implementationId', updateImplementation);
app.patch('/:implementationId', updateImplementation);