'use strict';

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');

var contexts = require('middleware/contexts');

app.get('/:id/files',
  contexts.findById('params.id'),
  contexts.checkFound,
  mw.query().if('prefix').else(mw.query().set('prefix', '/')),
  contexts.getFileList('query.prefix'),
  contexts.respondFileList);
