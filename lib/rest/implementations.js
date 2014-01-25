var body = require('middleware/body');
var implementations = require('middleware/implementations');
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
  implementations.create('body'),
  implementations.save,
  implementations.respond);