'use strict';

var express = require('express');
var app = module.exports = express();
var emailer = require('emailer');

app.post('/emails', function(req, res) {
  var data = {
    to: 'support@runnable.com',
    text: JSON.stringify(req.body)
  };
  emailer.sendEmail(data, function() {});
  res.json({
    message: 'thanks!'
  });
});
