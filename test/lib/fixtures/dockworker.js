'use strict';

var express = require('express');
var app = express();
var port = 3600;
var zlib = require('zlib');
var fstream = require('fstream');
var tar = require('tar');
var fs = require('fs');
var findit = require('findit');
var path = require('path');
var async = require('async');
var morgan = require('morgan');
var folderPath = __dirname + '/images/node.js/src/';

function createFilter (query) {
  return function filter (base) {
    if (/^\./.test(base) || base === 'node_modules') {
      return false;
    }
    return true;
  };
}

app.get('/api/files', function (req, res) {
  async.waterfall([
    function (cb) {
      fs.exists(folderPath, function (exists) {
        cb(null, exists);
      });
    },
    function (exists, cb) {
      if (exists) {
        fs.stat(folderPath, cb);
      } else {
        res.send('400', 'file does not exist');
      }
    }
  ], function (err, stat) {
    if (err) {
      return res.send(500);
    }
    if (stat.isFile()) {
      fs.createReadStream(folderPath)
        .pipe(zlib.createGzip())
        .pipe(res);
    } else if (stat.isDirectory()) {
      fstream
        .Reader({
          path: folderPath,
          type: "Directory",
          filter: createFilter(req.query)
        })
        .pipe(tar.Pack({
          fromBase: true
        }))
        .pipe(zlib.createGzip())
        .pipe(res);
    }
  });
});

app.get('/api/files/list', function (req, res) {
  var finder = findit(folderPath);
  var files = [];
  var filter = createFilter(req.query);

  finder.on('directory', function (dir, stat, stop) {
    var base = path.basename(dir);
    if (filter(base)) {
      if (dir !== folderPath) {
        files.push({
          name: base,
          path: path.dirname(dir),
          dir: true
        });
      }
    } else {
      stop();
    }
  });

  if (!req.query.directoriesOnly) {
    finder.on('file', function (file, stat) {
      var base = path.basename(file);
      if (filter(base)) {
        files.push({
          name: base,
          path: path.dirname(file),
          dir: false
        });
      }
    });
  }

  finder.on('end', function () {
    res.json(files);
  });
});

app.post('/api/files/readall', function (req, res) {
  // TODO: handle req.body.ignores
  var finder = findit(folderPath);
  var files = [];
  var filter = createFilter(req.query);

  finder.on('directory', function (dir, stat, stop) {
    var base = path.basename(dir);
    if (filter(base)) {
      if (dir !== folderPath) {
        files.push({
          name: base,
          path: path.dirname(dir),
          dir: true
        });
      }
    } else {
      stop();
    }
  });

  if (!req.query.directoriesOnly) {
    finder.on('file', function (file, stat) {
      var base = path.basename(file);
      if (filter(base)) {
        files.push({
          name: base,
          path: path.dirname(file),
          dir: false
        });
      }
    });
  }

  finder.on('end', function () {
    res.json(201, files);
  });
});

app.put('/api/files', function (req, res) {
  req
    .pipe(zlib.createGunzip())
    .on('finish', function () {
      res.send(200);
    });
});

app.post('/api/files/mkdir', function (req, res) {
  res.send(201);
});

app.post('/api/files/read', function (req, res) {
  res.send(201);
});

app.post('/api/files/move', function (req, res) {
  res.send(201);
});

app.post('/api/files/rename', function (req, res) {
  res.send(201);
});

app.post('/api/files/create', function (req, res) {
  res.send(201);
});

app.post('/api/files/update', function (req, res) {
  res.send(201);
});

app.post('/api/files/delete', function (req, res) {
  res.send(201);
});

app.post('/api/files/rmdir', function (req, res) {
  res.send(201);
});

app.post('/api/files', function (req, res) {
  fs.exists(path.join(folderPath, req.query.path), function (exists) {
    if (exists) {
      res.send(409, 'conflict: file exists');
    } else {
      req
        .pipe(zlib.createGunzip())
        .on('end', function () {
          res.send(200);
        });
    }
  });
});

app.get('/api/runcommand', function (req, res) {
  res.send(200);
});

app.post('/api/buildCmd', function (req, res) {
  res.send(204);
});

app.post('/api/cmd', function (req, res) {
  res.send(204);
});

app.post('/api/envs', function (req, res) {
  res.send(204);
});

app.all('*', morgan(), function (req, res) {
  res.send(404);
});

if (process.env.NODE_ENV !== 'testing-integration') {
  app.listen(port);
}
