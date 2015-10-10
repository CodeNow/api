'use strict';

var exists = require('101/exists');
var isNumber = require('101/is-number');

// send response and continue: do work in background
module.exports = function(statusCode, sendKey) {
  if (!exists(sendKey) && !isNumber(statusCode)) {
    sendKey = statusCode;
    statusCode = 200;
  }
  return function(req, res, next) {
    if (sendKey) {
      res.status(statusCode).send(req[sendKey]);
    } else {
      res.sendStatus(statusCode);
    }
    next();
  };
};
