var p = require('path');
var _ = require('lodash');
var extensions = require('extensions');
var utils = require('middleware/utils');
var containerFilesMethods = module.exports = {};

containerFilesMethods.checkCacheFileContent = function (name) {
  var ext = p.extname(name);
  return ~extensions.indexOf(ext);
};

containerFilesMethods.createFs = function (fileData, cb) {
  if (!this.checkCacheFileContent(fileData.name)) {
    delete fileData.content;
  }
  var self = this;
  self.files.push(fileData);
  var fileId = _.last(self.files)._id; // push generates new id
  self.last_write = new Date();
  self.save(function (err, container) {
    if (err) {
      cb(err);
    } else {
      self.set(container.toJSON());
      var file = self.findFileById(fileId);
      cb(null, file);
    }
  });
};

containerFilesMethods.updateFsById = function (fileId, fileData, cb) {
  if (!this.checkCacheFileContent(fileData.name)) {
    delete fileData.content;
  }
  var self = this;
  file = self.findFileById(fileId);
  file.set(fileData);
  self.last_write = new Date();
  self.save(function (err, container) {
    if (err) {
      cb(err);
    } else {
      self.set(self.toJSON());
      var file = self.findFileById(fileId);
      cb(null, file);
    }
  });
};

containerFilesMethods.findFileById = function (fileId) {
  return _.find(this.files, function (file) {
    return utils.equalObjectIds(file._id, fileId);
  });
};

containerFilesMethods.findDirById = function (dirId) {
  return _.find(this.files, function (file) {
    var found = file.dir === true && utils.equalObjectIds(file._id, dirId);
    return found;
  });
};

containerFilesMethods.findFilesByFilepaths = function (filepaths) {
  return this.files.filter(function (file) {
    var currentFilepath = p.join(file.path, file.name).toLowerCase();
    return !file.dir
      && filepaths
        .map(toLowerCase)
        .some(equals(currentFilepath));
  });
};

containerFilesMethods.findOneFiles = function (query) {
  if (_.isEmpty(query)) {
    return this.files[0];
  }
  return _.find(this.files, query);
};

containerFilesMethods.findFiles = function (query) {
  if (_.isEmpty(query)) {
    return this.files;
  }
  return _.where(this.files, query);
};

function toLowerCase(s) {
  return s.toLowerCase();
}

function equals (v) {
  return function (v2) {
    return v === v2;
  };
}