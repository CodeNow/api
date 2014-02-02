var configs = require('configs');
var request = require('request').defaults({
  pool: false,
  proxy: configs.dockworkerProxy,
  json: true
});
var domain = require('domain');
var path = require('path');
var zlib = require('zlib');
var tar = require('tar');
var concat = require('concat-stream');
module.exports = {
  files: {
    list: function (options, cb) {
      request({
        url: 'http://' +
          options.servicesToken +
          configs.domain +
          '/api/files/list',
        qs: options
      }, function (err, res, body) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 200) {
          cb(new Error('failed to list files'));
        } else {
          cb(null, body);
        }
      });
    },
    get: function (options, cb) {
      var d = domain.create();
      d.on('error', cb);
      d.run(function () {
        var files = [];
        request({
          url: 'http://' +
            options.servicesToken +
            configs.domain +
            '/api/files',
          qs: options
        })
          .pipe(zlib.createGunzip())
          .pipe(tar.Parse())
          .on('entry', function (e) {
            e.pipe(concat(function (content) {
              files.push({
                name: path.basename(e.props.path),
                content: content,
                path: path.dirname(e.props.path)
              });
            }));
          })
          .on('end', function () {
            cb(null, files);
          });
      });
    }
  }
};