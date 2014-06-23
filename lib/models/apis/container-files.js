'use strict';

// var ApiClient = require('simple-api-client');
// var isFunction = require('101/is-function');

module.exports = ContainerFiles;

function ContainerFiles (container) {
  return container;
}

ContainerFiles.prototype.create = function (path, data, cb) {
  // if (isFunction(data))
  this.post(path, { json: data }, cb);
};

ContainerFiles.prototype.read = function (path, cb) {
  // this.post(path, { json: data }, cb);
  cb(false);
};

ContainerFiles.prototype.list = function (path, query, cb) {
  cb(false);
};

ContainerFiles.prototype.update = function (path, cb) {
  cb(false);
};

ContainerFiles.prototype.delete = function (path, cb) {
  cb(false);
};
