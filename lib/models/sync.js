var path = require('path');
var volumes = require('./volumes');
var _ = require('lodash');
var exts = require('../extensions');
module.exports = function (domain, token, target, cb) {
  var ignores = [];
  var new_file_list = [];
  var _ref = target.files;
  for (var _i = 0, _len = _ref.length; _i < _len; _i++) {
    var file = _ref[_i];
    if (file.ignore) {
      ignores.push(path.normalize('' + file.path + '/' + file.name));
      new_file_list.push(file);
    }
  }
  var old_file_list = _.clone(target.files);
  volumes.readAllFiles(domain, token, target.file_root, ignores, exts, function (err, allFiles) {
    if (err) {
      cb(err);
    } else {
      allFiles.forEach(function (file) {
        var new_file = {
          name: file.name,
          path: file.path
        };
        if (file.dir) {
          new_file.dir = true;
        }
        if (file.content != null) {
          new_file.content = file.content;
        }
        for (var _j = 0, _len1 = old_file_list.length; _j < _len1; _j++) {
          var existingFile = old_file_list[_j];
          if (file.path === existingFile.path && file.name === existingFile.name) {
            new_file._id = existingFile._id;
            new_file['default'] = existingFile['default'];
            new_file.ignore = existingFile.ignore;
            break;
          }
        }
        new_file_list.push(new_file);
      });
      target.files = new_file_list;
      cb();
    }
  });
};