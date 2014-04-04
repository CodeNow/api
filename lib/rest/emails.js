var express = require('express');
var app = module.exports = express();
var utils = require('middleware/utils');
var emailer = require('emailer');

app.post('/emails',
  function (req, res, next){
  	var data = {
  		to: 'cflynn.us@gmail.com',
  		text: req.body
  	};
  	emailer.sendEmail(data, function () {
  	});
    res.json({message: 'thanks!'});
  });
