var configs, exts, path, volumes, _;
configs = require('../configs');
path = require('path');
volumes = require('./volumes');
_ = require('lodash');
exts = require('../extensions');
module.exports = function (domain, token, target, cb) {
  var file, ignores, new_file_list, old_file_list, _i, _len, _ref;
  ignores = [];
  new_file_list = [];
  _ref = target.files;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    file = _ref[_i];
    if (file.ignore) {
      ignores.push(path.normalize('' + file.path + '/' + file.name));
      new_file_list.push(file);
    }
  }
  old_file_list = _.clone(target.files);
  return volumes.readAllFiles(domain, token, target.file_root, ignores, exts, function (err, allFiles) {
    if (err) {
      return cb(err);
    } else {
      allFiles.forEach(function (file) {
        var existingFile, new_file, _j, _len1;
        new_file = {
          name: file.name,
          path: file.path
        };
        if (file.dir) {
          new_file.dir = true;
        }
        if (file.content != null) {
          new_file.content = file.content;
        }
        for (_j = 0, _len1 = old_file_list.length; _j < _len1; _j++) {
          existingFile = old_file_list[_j];
          if (file.path === existingFile.path && file.name === existingFile.name) {
            new_file._id = existingFile._id;
            new_file['default'] = existingFile['default'];
            new_file.ignore = existingFile.ignore;
            break;
          }
        }
        return new_file_list.push(new_file);
      });
      target.files = new_file_list;
      return cb();
    }
  });
};