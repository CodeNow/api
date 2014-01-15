var Volumes, configs, debug, error, proxy, request;
configs = require('../configs');
debug = require('debug')('volumes');
error = require('../error');
request = require('request');
if (configs.dockworkerProxy) {
  request = request.defaults({
    proxy: configs.dockworkerProxy
  });
}
Volumes = {
  createFile: function (domain, subDomain, srcDir, name, path, content, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/create',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        content: content
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb();
        }
      }
    });
  },
  streamFile: function (domain, subDomain, srcDir, name, path, stream, cb) {
    var form, r;
    r = request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/stream',
      method: 'POST'
    });
    form = r.form();
    form.append('dir', srcDir);
    form.append('name', name);
    form.append('path', path);
    form.append('content', stream);
    r.on('error', function (err) {
      throw err;
    });
    r.on('response', function (res) {
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb();
        }
      }
    });
    return stream.resume();
  },
  readFile: function (domain, subDomain, srcDir, name, path, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/read',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb(null, res.body);
        }
      }
    });
  },
  updateFile: function (domain, subDomain, srcDir, name, path, content, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/update',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        content: content
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb();
        }
      }
    });
  },
  deleteFile: function (domain, subDomain, srcDir, name, path, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/delete',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb();
        }
      }
    });
  },
  renameFile: function (domain, subDomain, srcDir, name, path, newName, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/rename',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        newName: newName
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb();
        }
      }
    });
  },
  moveFile: function (domain, subDomain, srcDir, name, path, newPath, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/move',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        newPath: newPath
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb();
        }
      }
    });
  },
  readAllFiles: function (domain, subDomain, srcDir, ignores, exts, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/readall',
      method: 'POST',
      json: {
        dir: srcDir,
        ignores: ignores,
        exts: exts
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb(null, res.body);
        }
      }
    });
  },
  createDirectory: function (domain, subDomain, srcDir, name, path, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/mkdir',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb();
        }
      }
    });
  },
  readDirectory: function (domain, subDomain, srcDir, subDir, exts, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/readdir',
      method: 'POST',
      json: {
        dir: srcDir,
        sub: subDir,
        exts: exts
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb(null, res.body);
        }
      }
    });
  },
  removeDirectory: function (domain, subDomain, srcDir, name, path, recursive, cb) {
    return request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/rmdir',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        recursive: recursive
      }
    }, function (err, res) {
      if (err) {
        throw err;
      }
      if (res.statusCode === 502) {
        return cb(error(500, 'runnable not responding to file requests'));
      } else {
        if (res.statusCode !== 201) {
          return cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          return cb();
        }
      }
    });
  }
};
module.exports = Volumes;