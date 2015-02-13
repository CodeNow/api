'use strict';

// send response and continue: do work in background
module.exports = function (statusCode, sendKey) {
  return function (req, res, next) {
    if (sendKey) {
      res.send(statusCode, req[sendKey]);
    }
    else {
      res.sendStatus(statusCode);
    }
    next();
  };
};