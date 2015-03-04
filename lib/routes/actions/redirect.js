'use strict';

var express = require('express');
var app = module.exports = express();
var Heap = require('models/apis/heap');
var heap = new Heap();
var debug = require('debug')('runnable-api:actions-redirect');

app.get('/actions/redirect',
  function (req, res) {
    if (!req.query.url) {
      return res.status(404).end();
    }
    var url = decodeURIComponent(req.query.url);

    if (url.indexOf('https://github.com/') !== 0) {
      return res.status(404).end();
    }

    res.redirect(302, url);
    debug('tracking redirect');
    // track
    if (req.sessionUser) {
      var githubId = req.sessionUser.accounts.github.id;
      heap.track(githubId, 'notification_github_link', {
        url: url
      });
      debug('redirect was tracked');
    }

  });