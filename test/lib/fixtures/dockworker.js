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

app.post('/api/buildCmd', function (req, res) {
  res.send(200);
});

app.post('/api/cmd', function (req, res) {
  res.send(200);
});

app.post('/api/envs', function (req, res) {
  res.send(200);
});

app.all('*', express.logger(), function (req, res) {
  res.send(404);
});

if (process.env.NODE_ENV !== 'testing-integration') {
  app.listen(port);
}