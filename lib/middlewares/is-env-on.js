'use strict';

// check if env is on (=== 'true'). Otherwise send response.
module.exports = function(envName, statusCode, message) {
  return function(req, res, next) {
    // our env parsing cannot parse boolean correctly atm
    if (process.env[envName] !== 'true') {
      res.status(statusCode);
      res.send(message);
    } else {
      next();
    }
  };
};