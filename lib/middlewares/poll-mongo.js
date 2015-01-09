'use strict';
var keypather = require('keypather')();
var error = require('error');

/*jshint maxcomplexity:6*/
var pollMongo = module.exports = function (input) {
  //(idPath, database, successKeyPath, failureKeyPath, successCb, failureCb)
  return function (req, res, next) {
    var id = keypather.get(req, input.idPath);
    var fields = {};
    fields[input.successKeyPath] = 1;
    fields[input.failureKeyPath] = 1;
    var startTime = Date.now();
    input.database.findById(id, function (err, model) {
      if (err) {
        error.logIfErr(err);
      }
      var failureKeyPathValue = keypather.get(model, input.failureKeyPath);
      if (failureKeyPathValue) {
        if (input.failureCb) {
          input.failureCb(failureKeyPathValue, req, res, next);
        } else {
          req.pollMongoResult = false;
          next();
        }
      } else if (keypather.get(model, input.successKeyPath)) {
        if (input.successCb) {
          input.successCb(req, res, next);
        } else {
          req.pollMongoResult = true;
          next();
        }
      } else {
        var endTime = Date.now();
        if (startTime + process.env.POLL_MONGO_TIMEOUT < endTime) {
          setTimeout(pollMongo(input), process.env.BUILD_END_TIMEOUT, req, res, next);
        } else {
          if (input.failureCb) {
            input.failureCb(failureKeyPathValue, req, res, next);
          } else {
            req.pollMongoResult = false;
            next();
          }
        }
      }
    });
  };
};