var utils = require('middleware/utils');
var RequestData = require('middleware/RequestData');
var error = require('error');

var Headers = function () {};

Headers.prototype = new RequestData('headers');

Headers.prototype.contentTypeIs = function (/*types*/) {
  var contentTypes = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    var acceptableContentType = contentTypes.some(function (type) {
      return req.is(type);
    });
    if (!acceptableContentType) {
      var typesStr = utils.arrayToString(contentTypes, 'or');
      return next(error(415, 'Request content-type expected to be ' + typesStr));
    }
    next();
  };
};


module.exports = new Headers();