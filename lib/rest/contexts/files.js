'use strict';

var express = require('express');
var app = module.exports = express();
// var join = require('path').join;
var mw = require('dat-middleware');

var contexts = require('middleware/contexts');

// /contexts/:id/files
module.exports = function (baseUrl) {

  app.get(baseUrl,
    contexts.findById('params.id'),
    contexts.checkFound,
    mw.query().if('prefix').else(mw.query().set('prefix', '/')),
    contexts.getFileList('query.prefix'),
    contexts.respondFileList);

  return app;
};
