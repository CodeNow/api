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
RequestData.prototype.setFromQuery = function (key, queryKey) {
  var dataType = this.dataType;
  return function (req, res, next) {
    console.log(this.date);
    req[dataType][key] = req.query[queryKey];
    next();
  };
};