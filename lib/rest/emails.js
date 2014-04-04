var express = require('express');
var app = module.exports = express();
var utils = require('middleware/utils');
var emailer = require('emailer');

app.post('/emails',
  function (req, res, next){
  	var data = {
  		to: 'support@runnable.com',
  		text: JSON.stringify(req.body)
  	};
  	emailer.sendEmail(data, function () {
  	});
    res.json({message: 'thanks!'});
  });
