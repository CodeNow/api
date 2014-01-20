var utils = require('./utils');

var RequestData = module.exports = function (dataType) {
  this.dataType = dataType;
  this.every = utils.every.bind(null, dataType);
  if (dataType === 'query') {
    this.dataName = 'query parameter';
  }
  else if (dataType === 'body') {
    this.dataName = 'body parameter';
  }
  else if (dataType === 'params') {
    this.dataName = 'url parameter';
  }
};
RequestData.prototype.require = function () {
  var errMessage = '"{{key}}" '+this.dataName+' is required';
  return this.every(utils.exists, 400, errMessage)
    .apply(null, arguments);
};
RequestData.prototype.isObjectId64 = function () {
  var errMessage = '"{{key}}" '+this.dataName+' must be an object id';
  return this.every(utils.isObjectId64, 400, errMessage)
    .apply(null, arguments);
};
RequestData.prototype.setFromQuery = setFrom('query');
RequestData.prototype.setFromBody = setFrom('body');
RequestData.prototype.setFromParams = setFrom('params');

function setFrom (dataType) {
  return function (selfDatakey, dataKey) {
    var selfDataType = this.dataType;
    return function (req, res, next) {
      req[selfDataType] = req[selfDataType] || {};
      req[selfDataType][selfDatakey] = req[dataType][dataKey];
      next();
    };
  };
}