var users = require('middleware/users');
var specifications = require('middleware/specifications');
var body = require('middleware/body');
var params = require('middleware/params');
var utils = require('middleware/utils');
var series = utils.series;
var express = require('express');
var app = module.exports = express();

app.post('/',
  users.isVerified,
  body.require('name', 'requirements'),
  specifications.findConflict({
    name: 'body.name'
  }),
  body.pick('name', 'description', 'instructions', 'requirements'),
  body.set('owner', 'user_id'),
  specifications.create('body'),
  specifications.save,
  specifications.respond);

app.get('/',
  specifications.find(),
  specifications.respond);

app.get('/:specificationId',
  params.isObjectId('specificationId'),
  specifications.findById('params.specificationId'),
  specifications.respond);

var updateSpecification = series(
  params.isObjectId('specificationId'),
  body.pickAndRequireOne('name', 'description', 'instructions', 'requirements'),
  specifications.findById('params.specificationId', { _id:1, owner:1 }),
  specifications.checkFound,
  users.isSpecificationOwner,
  body.if('name', specifications.findConflict({
    name: 'body.name'
  })),
  specifications.findByIdAndUpdate('params.specificationId', 'body'),
  specifications.respond);

app.put('/:specificationId', updateSpecification);
app.patch('/:specificationId', updateSpecification);