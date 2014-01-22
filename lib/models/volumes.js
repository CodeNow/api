var configs = require('configs');
var error = require('error');
var request = require('request');
if (configs.dockworkerProxy) {
  request = request.defaults({
    proxy: configs.dockworkerProxy
  });
}
var Volumes = {
  createFile: function (domain, subDomain, srcDir, name, path, content, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/create',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        content: content
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb();
      }
    }));
  },
  streamFile: function (domain, subDomain, srcDir, name, path, stream, cb) {
    var r = request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/stream',
      method: 'POST'
    });
    var form = r.form();
    form.append('dir', srcDir);
    form.append('name', name);
    form.append('path', path);
    form.append('content', stream);
    r.on('error', domain.intercept(function () {}));
    r.on('response', domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb();
      }
    }));
    stream.resume();
  },
  readFile: function (domain, subDomain, srcDir, name, path, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/read',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb(null, res.body);
      }
    }));
  },
  updateFile: function (domain, subDomain, srcDir, name, path, content, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/update',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        content: content
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb();
      }
    }));
  },
  deleteFile: function (domain, subDomain, srcDir, name, path, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/delete',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb();
      }
    }));
  },
  renameFile: function (domain, subDomain, srcDir, name, path, newName, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/rename',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        newName: newName
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb();
      }
    }));
  },
  moveFile: function (domain, subDomain, srcDir, name, path, newPath, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/move',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        newPath: newPath
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb();
      }
    }));
  },
  readAllFiles: function (domain, subDomain, srcDir, ignores, exts, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/readall',
      method: 'POST',
      json: {
        dir: srcDir,
        ignores: ignores,
        exts: exts
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb(null, res.body);
      }
    }));
  },
  createDirectory: function (domain, subDomain, srcDir, name, path, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/mkdir',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb();
      }
    }));
  },
  readDirectory: function (domain, subDomain, srcDir, subDir, exts, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/readdir',
      method: 'POST',
      json: {
        dir: srcDir,
        sub: subDir,
        exts: exts
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb(null, res.body);
      }
    }));
  },
  removeDirectory: function (domain, subDomain, srcDir, name, path, recursive, cb) {
    request({
      pool: false,
      url: 'http://' + subDomain + '.' + configs.domain + '/api/files/rmdir',
      method: 'POST',
      json: {
        dir: srcDir,
        name: name,
        path: path,
        recursive: recursive
      }
    }, domain.intercept(function (res) {
      if (res.statusCode === 502) {
        cb(error(500, 'runnable not responding to file requests'));
      } else if (res.statusCode !== 201) {
        cb(error(res.statusCode, 'unknown error response from runnable'));
      } else {
        cb();
      }
    }));
  }
};
module.exports = Volumes;