var async = require('async');
var configs = require('../configs');
var express = require('express');
var fs = require('fs');
var formidable = require('formidable');
var users = require('../models/users');
var images = require('../models/images');
var redis = require('redis');
var runnables = require('../models/runnables');
var uuid = require('node-uuid');
var _ = require('lodash');
var url = require('url');
var redis_client = redis.createClient(configs.redis.port, configs.redis.ipaddress);
var app = module.exports = express();
var fetchuser = function (req, res, next) {
  if (!req.params.userid.match(/^[0-9a-fA-F]{24}$/)) {
    res.json(404, { message: 'user not found' });
  } else {
    async.parallel({
      urlUser:
        function (cb) {
          users.findById(req.params.userid, req.domain.intercept(function (user) {
            cb(null, user);
          }));
        },
      sessionUser:
        function (cb) {
          users.findById(req.user_id, req.domain.intercept(function (user) {
            cb(null, user);
          }));
        }
    }, function (err, results) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      }
      if (!results.urlUser) {
        return res.json(404, { message: 'user not found' });
      }
      if (req.params.userid.toString() !== req.user_id.toString() && !results.sessionUser.isModerator) {
        return res.json(403, { message: 'permission denied' });
      }
      next();
    });
  }
};
app.post('/users', function (req, res) {
  users.createUser(req.domain, req.domain.intercept(function (user) {
    var access_token = uuid.v4();
    redis_client.psetex([
      access_token,
      configs.tokenExpires,
      user._id
    ], req.domain.intercept(function () {
      var json_user = user.toJSON();
      json_user.access_token = access_token;
      if (req.body.email == null) {
        res.json(201, json_user);
      } else if (req.body.username == null) {
        res.json(400, { message: 'must provide a username to register with' });
      } else if (req.body.password == null) {
        res.json(400, { message: 'must provide a password to register with' });
      } else {
        var data = _.pick(req.body, 'email', 'username', 'password');
        users.registerUser(req.domain, user._id, data, req.domain.intercept(function (user) {
          var json_user = user.toJSON();
          delete json_user.password;
          json_user.access_token = access_token;
          res.json(201, json_user);
        }));
      }
    }));
  }));
});
app.get('/token', function (req, res) {
  var token = req.get('runnable-token');
  if (token) {
    res.send(200, token);
  } else {
    res.send(404);
  }
});
app.post('/token', function (req, res) {
  if (req.body.username == null && req.body.email == null) {
    res.json(400, { message: 'username or email required' });
  } else if (req.body.password == null) {
    res.json(400, { message: 'password required' });
  } else {
    var identity = req.body.email || req.body.username;
    users.loginUser(req.domain, identity, req.body.password, req.domain.intercept(function (user_id) {
      var response = function () {
        var access_token;
        access_token = uuid.v4();
        redis_client.psetex([
          access_token,
          configs.tokenExpires,
          user_id
        ], req.domain.intercept(function () {
          res.json({ access_token: access_token });
        }));
      };
      var token = req.get('runnable-token');
      if (!token) {
        response();
      } else {
        redis_client.get(token, req.domain.intercept(function (old_user_id) {
          if (!old_user_id) {
            response();
          } else {
            users.findUser(req.domain, { _id: old_user_id }, req.domain.intercept(function (old_user) {
              if (old_user.password) {
                response();
              } else {
                runnables.migrateContainers(req.domain, old_user_id, user_id, req.domain.intercept(function () {
                  response();
                }));
              }
            }));
          }
        }));
      }
    }));
  }
});
app.all('*', function (req, res, next) {
  if (/\/runnables\?map=true|\/channels\?map=true/.test(url.parse(req.url).path)) {
    next();
  } else {
    var token = req.get('runnable-token');
    if (!token) {
      res.json(401, { message: 'access token required' });
    } else {
      redis_client.get(token, req.domain.intercept(function (user_id) {
        if (!user_id) {
          res.json(401, { message: 'must provide a valid access token' });
        } else {
          req.user_id = user_id;
          next();
        }
      }));
    }
  }
});
var getusers = function (req, res, next) {
  var sendUsers = req.domain.intercept(function (users) {
    res.json(users);
  });
  if (req.query.ids) {
    var userIds = [].concat(req.query.ids);
    users.publicListWithIds(req.domain, userIds, sendUsers);
  } else if (req.query.username) {
    users.publicList(req.domain, { lower_username: req.query.username.toLowerCase() }, sendUsers);
  } else if (req.query.channel) {
    users.channelLeaders(req.domain, req.query.channel, req.query.idsOnly, sendUsers);
  } else {
    res.json(400, { message: 'must provide ids or username for users to get' });
  }
};
app.get('/users', getusers);
var getuser = function (req, res) {
  users.findUser(req.domain, { _id: req.user_id }, req.domain.intercept(function (user) {
    if (!user) {
      res.json(404, { message: 'user doesnt exist' });
    } else {
      var json_user = user.toJSON();
      json_user.votes = user.getVotes();
      delete json_user.password;
      images.count({ owner: user._id }, req.domain.intercept(function (imagesCount) {
        json_user.imagesCount = imagesCount;
        res.json(json_user);
      }));
    }
  }));
};
app.get('/users/me', getuser);
app.get('/users/:userid', fetchuser, getuser);
var deluser = function (req, res) {
  users.removeUser(req.domain, req.user_id, function () {
    res.json({ message: 'user deleted' });
  });
};
app.del('/users/me', deluser);
app.del('/users/:userid', fetchuser, deluser);
var putuser = function (req, res) {
  users.findUser(req.domain, { _id: req.user_id }, req.domain.intercept(function (user) {
    if (user.permission_level !== 0) {
      res.json(403, { message: 'you are already registered' });
    } else if (req.body.email == null) {
      res.json(400, { message: 'must provide an email to register with' });
    } else if (req.body.username == null) {
      res.json(400, { message: 'must provide a username to register with' });
    } else if (req.body.password == null) {
      res.json(400, { message: 'must provide a password to register with' });
    } else {
      var data = _.pick(req.body, 'email', 'username', 'password');
      users.registerUser(req.domain, req.user_id, data, req.domain.intercept(function (user) {
        res.json(user);
      }));
    }
  }));
};
app.put('/users/me', putuser);
app.put('/users/:userid', fetchuser, putuser);
var patchuser = function (req, res) {
  var allowed, data;
  allowed = [
    'name',
    'company',
    'show_email',
    'initial_referrer'
  ];
  data = _.pick(req.body, allowed);
  users.updateUser(req.domain, req.user_id, data, {
    password: 0,
    votes: 0
  }, req.domain.intercept(function (user) {
    res.json(user);
  }));
};
app.patch('/users/me', patchuser);
app.patch('/users/:userid', fetchuser, patchuser);
var getvotes = function (req, res) {
  users.findUser(req.domain, { _id: req.user_id }, req.domain.intercept(function (user) {
    res.json(user.getVotes());
  }));
};
app.get('/users/me/votes', getvotes);
app.get('/users/:userid/votes', fetchuser, getvotes);
var postvote = function (req, res) {
  if (req.body.runnable == null) {
    res.json(400, { message: 'must include runnable to vote on' });
  } else {
    runnables.vote(req.domain, req.user_id, req.body.runnable, req.domain.intercept(function (vote) {
      res.json(201, vote);
    }));
  }
};
app.post('/users/me/votes', postvote);
app.post('/users/:userid/votes', fetchuser, postvote);
var removevote = function (req, res, next) {
  users.findUser(req.domain, { _id: req.user_id }, req.domain.intercept(function (user) {
    user.removeVote(req.domain, req.params.voteid, req.domain.intercept(function () {
      res.json({ message: 'removed vote' });
    }));
  }));
};
app.del('/users/me/votes/:voteid', removevote);
app.del('/users/:userid/votes/:voteid', fetchuser, removevote);
var postrunnable = function (req, res) {
  if (req.query.from == null) {
    res.json(400, { message: 'must provide a runnable to fork from' });
  } else {
    runnables.createContainer(req.domain, req.user_id, req.query.from, req.domain.intercept(function (container) {
      res.json(201, container);
    }));
  }
};
app.post('/users/me/runnables', postrunnable);
app.post('/users/:userid/runnables', fetchuser, postrunnable);
var getrunnables = function (req, res) {
  var query = _.pick(req.query, 'parent', 'saved');
  runnables.listContainers(req.domain, req.params.userid || req.user_id, query, function (err, containers) {
    if (err) {
      return res.json(err.code, { message: err.msg });
    }
    res.json(containers);
  });
};
app.get('/users/me/runnables', getrunnables);
app.get('/users/:userid/runnables', fetchuser, getrunnables);
var getrunnable = function (req, res) {
  runnables.getContainer(req.domain, req.params.userid || req.user_id, req.params.runnableid, req.domain.intercept(function (container) {
    res.json(container);
  }));
};
app.get('/users/me/runnables/:runnableid', getrunnable);
app.get('/users/:userid/runnables/:runnableid', fetchuser, getrunnable);
var putrunnable = function (req, res) {
  var required = [
    'name',
    'description'
  ];
  var optional = [
    'specification',
    'saved',
    'start_cmd',
    'build_cmd',
    'output_format',
    'status',
    'commit_error',
    'service_cmds'
  ];
  var set = {};
  for (var _i = 0, _len = required.length; _i < _len; _i++) {
    var attr = required[_i];
    if (req.body[attr] === void 0) {
      return res.json(400, { message: 'must provide a runnable ' + attr });
    } else {
      set[attr] = req.body[attr];
    }
  }
  optional.forEach(function (attr) {
    if (req.body[attr] !== void 0) {
      set[attr] = req.body[attr];
    }
  });
  runnables.updateContainer(req.domain, req.user_id, req.params.runnableid, set, req.get('runnable-token'), req.domain.intercept(function (runnable) {
    res.json(runnable);
  }));
};
app.put('/users/me/runnables/:runnableid', putrunnable);
app.put('/users/:userid/runnables/:runnableid', fetchuser, putrunnable);
var patchrunnable = function (req, res) {
  var set = _.pick(req.body, 'name', 'description', 'specification', 'saved', 'start_cmd', 'build_cmd', 'output_format', 'status', 'commit_error', 'service_cmds');
  runnables.updateContainer(req.domain, req.user_id, req.params.runnableid, set, req.get('runnable-token'), req.domain.intercept(function (runnable) {
    res.json(runnable);
  }));
};
app.patch('/users/me/runnables/:runnableid', patchrunnable);
app.patch('/users/:userid/runnables/:runnableid', fetchuser, patchrunnable);
var delrunnable = function (req, res) {
  return runnables.removeContainer(req.domain, req.user_id, req.params.runnableid, function (err) {
    if (err) {
      return res.json(err.code, { message: err.msg });
    } else {
      return res.json({ message: 'runnable deleted' });
    }
  });
};
app.del('/users/me/runnables/:runnableid', delrunnable);
app.del('/users/:userid/runnables/:runnableid', fetchuser, delrunnable);
var gettags = function (req, res) {
  runnables.getContainerTags(req.domain, req.params.id, req.domain.intercept(function (tags) {
    res.json(tags);
  }));
};
app.get('/users/me/runnables/:id/tags', gettags);
app.get('/users/:userid/runnables/:id/tags', fetchuser, gettags);
var posttag = function (req, res) {
  if (req.body.name == null) {
    res.json(400, { message: 'tag must include a name field' });
  } else {
    runnables.addContainerTag(req.domain, req.user_id, req.params.id, req.body.name, req.domain.intercept(function (tag) {
      res.json(201, tag);
    }));
  }
};
app.post('/users/me/runnables/:id/tags', posttag);
app.post('/users/:userid/runnables/:id/tags', fetchuser, posttag);
var gettag = function (req, res) {
  runnables.getContainerTag(req.domain, req.params.id, req.params.tagId, req.domain.intercept(function (tag) {
    res.json(tag);
  }));
};
app.get('/users/me/runnables/:id/tags/:tagId', gettag);
app.get('/users/:userid/runnables/:id/tags/:tagId', fetchuser, gettag);
var deltag = function (req, res) {
  runnables.removeContainerTag(req.domain, req.user_id, req.params.id, req.params.tagId, req.domain.intercept(function () {
    res.json({ message: 'tag deleted' });
  }));
};
app.del('/users/me/runnables/:id/tags/:tagId', deltag);
app.del('/users/:userid/runnables/:id/tags/:tagId', fetchuser, deltag);
var listfiles = function (req, res) {
  var content = req.query.content != null;
  var dir = req.query.dir != null;
  var default_tag = req.query['default'] != null;
  var path = req.query.path;
  runnables.listFiles(req.domain, req.user_id, req.params.runnableid, content, dir, default_tag, path, req.domain.intercept(function (files) {
    res.json(files);
  }));
};
app.get('/users/me/runnables/:runnableid/files', listfiles);
app.get('/users/:userid/runnables/:runnableid/files', fetchuser, listfiles);
var syncfiles = function (req, res) {
  runnables.syncFiles(req.domain, req.user_id, req.params.id, req.domain.intercept(function () {
    res.json(201, {
      message: 'files synced successfully',
      date: new Date()
    });
  }));
};
app.post('/users/me/runnables/:id/sync', syncfiles);
app.post('/users/:userid/runnables/:id/sync', fetchuser, syncfiles);
var createfile = function (req, res, next) {
  var contentType = req.headers['content-type'];
  if (contentType === 'application/json') {
    if (req.body.dir) {
      createDir();
    } else {
      createFile();
    }
  } else {
    if (/multipart\/form-data/.test(contentType)) {
      multipart();
    } else {
      res.json(400, { message: 'content type must be application/json or multipart/form-data' });
    }
  }
  function createDir () {
    if (req.body.name == null) {
      res.json(400, { message: 'dir must include a name field' });
    } else if (req.body.path == null) {
      res.json(400, { message: 'dir must include a path field' });
    } else {
      runnables.createDirectory(req.domain, req.user_id, req.params.id, req.body.name, req.body.path, req.domain.intercept(function (dir) {
        res.json(201, dir);
      }));
    }
  }
  function createFile () {
    if (req.body.name == null) {
      res.json(400, { message: 'file must include a name field' });
    } else if (req.body.content == null) {
      res.json(400, { message: 'file must include a content field' });
    } else if (req.body.path == null) {
      res.json(400, { message: 'file must include a path field' });
    } else {
      runnables.createFile(req.domain, req.user_id, req.params.id, req.body.name, req.body.path, req.body.content, req.domain.intercept(function (file) {
        res.json(201, file);
      }));
    }
  }
  function multipart () {
    var form = new formidable.IncomingForm();
    form.parse(req, req.domain.intercept(function (fields, files) {
      var files_array = [];
      for (var key in files) {
        var file = files[key];
        files_array.push(file);
      }
      async.mapSeries(files_array, function (file, cb) {
        var filestream = fs.createReadStream(file.path);
        filestream.pause();
        runnables.createFile(req.domain, req.user_id, req.params.id, file.name, '/', filestream, cb);
      }, req.domain.intercept(function (files) {
        res.json(201, files);
      }));
    }));
  }
};
app.post('/users/me/runnables/:id/files/', createfile);
app.post('/users/me/runnables/:id/files', createfile);
app.post('/users/:userid/runnables/:id/files/', fetchuser, createfile);
app.post('/users/:userid/runnables/:id/files', fetchuser, createfile);
var streamupdate = function (req, res, next) {
  var contentType = req.headers['content-type'];
  if (/multipart\/form-data/.test(contentType)) {
    var form = new formidable.IncomingForm();
    form.parse(req, req.domain.intercept(function (fields, files) {
      var files_array = [];
      for (var key in files) {
        var file = files[key];
        files_array.push(file);
      }
      async.mapSeries(files_array, function (file, cb) {
        var filestream = fs.createReadStream(file.path);
        filestream.pause();
        runnables.updateFileContents(req.domain, req.user_id, req.params.id, '/' + file.name, filestream, cb);
      }, req.domain.intercept(function (files) {
        res.json(200, files);
      }));
    }));
  } else {
    res.json(400, { message: 'content type must be application/json or multipart/form-data' });
  }
};
app.put('/users/me/runnables/:id/files', streamupdate);
app.put('/users/:userid/runnables/:id/files', fetchuser, streamupdate);
var createindir = function (req, res, next) {
  var contentType = req.headers['content-type'];
  if (/multipart\/form-data/.test(contentType)) {
    var form = new formidable.IncomingForm();
    form.parse(req, req.domain.intercept(function (fields, files) {
      var files_array = [];
      for (var key in files) {
        var file = files[key];
        files_array.push(file);
      }
      runnables.readFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.domain.intercept(function (root) {
        if (!root.dir) {
          res.json(403, { message: 'resource is not of directory type' });
        } else {
          async.mapSeries(files_array, function (file, cb) {
            var filestream = fs.createReadStream(file.path);
            filestream.pause();
            runnables.createFile(req.domain, req.user_id, req.params.id, file.name, '' + root.path + '/' + root.name, filestream, cb);
          }, req.domain.intercept(function (files) {
            res.json(201, files);
          }));
        }
      }));
    }));
  } else {
    return res.json(400, { message: 'content type must be multipart/form-data' });
  }
};
app.post('/users/me/runnables/:id/files/:fileid', createindir);
app.post('/users/:userid/runnables/:id/files/:fileid', fetchuser, createindir);
var getfile = function (req, res) {
  runnables.readFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.domain.intercept(function (file) {
    res.json(file);
  }));
};
app.get('/users/me/runnables/:id/files/:fileid', getfile);
app.get('/users/:userid/runnables/:id/files/:fileid', fetchuser, getfile);
var updatefile = function (req, res, next) {
  var contentType = req.headers['content-type'];
  if (contentType === 'application/json') {
    async.waterfall([
      function (cb) {
        var file = null;
        if (req.body.content == null) {
          cb(null, file);
        } else {
          runnables.updateFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.body.content, cb);
        }
      },
      function (file, cb) {
        if (req.body.path == null) {
          cb(null, file);
        } else {
          runnables.moveFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.body.path, cb);
        }
      },
      function (file, cb) {
        if (req.body.name == null) {
          cb(null, file);
        } else {
          runnables.renameFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.body.name, cb);
        }
      },
      function (file, cb) {
        if (req.body['default'] == null) {
          cb(null, file);
        } else {
          runnables.defaultFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.body['default'], cb);
        }
      }
    ], req.domain.intercept(function (file) {
      if (!file) {
        res.json(400, { message: 'must provide content, name, path or tag to update operation' });
      } else {
        res.json(file);
      }
    }));
  } else {
    if (/multipart\/form-data/.test(contentType)) {
      var form = new formidable.IncomingForm();
      form.parse(req, req.domain.intercept(function (fields, files) {
        var files_array = [];
        for (var key in files) {
          var file = files[key];
          files_array.push(file);
        }
        runnables.readFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.domain.intercept(function (root) {
          if (!root.dir) {
            res.json(403, { message: 'resource is not of directory type' });
          } else {
            async.mapSeries(files_array, function (file, cb) {
              var filestream = fs.createReadStream(file.path);
              filestream.pause();
              runnables.updateFileContents(req.domain, req.user_id, req.params.id, '' + root.path + '/' + root.name + '/' + file.name, filestream, cb);
            }, req.domain.intercept(function (files) {
              res.json(200, files);
            }));
          }
        }));
      }));
    } else {
      res.json(400, { message: 'content type must be application/json or multipart/form-data' });
    }
  }
};
app.put('/users/me/runnables/:id/files/:fileid', updatefile);
app.patch('/users/me/runnables/:id/files/:fileid', updatefile);
app.put('/users/:userid/runnables/:id/files/:fileid', fetchuser, updatefile);
app.patch('/users/:userid/runnables/:id/files/:fileid', fetchuser, updatefile);
var deletefile = function (req, res) {
  var recursive = req.query.recursive != null ? req.query.recursive : true;
  runnables.deleteFile(req.domain, req.user_id, req.params.id, req.params.fileid, recursive, req.domain.intercept(function () {
    res.json({ message: 'file deleted' });
  }));
};
app.del('/users/me/runnables/:id/files/:fileid', deletefile);
app.del('/users/:userid/runnables/:id/files/:fileid', fetchuser, deletefile);
var getmountedfiles = function (req, res) {
  var mountDir = req.query.path || '/';
  runnables.getMountedFiles(req.domain, req.user_id, req.params.id, req.params.fileid, mountDir, req.domain.intercept(function (files) {
    res.json(files);
  }));
};
app.get('/users/me/runnables/:id/files/:fileid/files', getmountedfiles);
app.get('/users/:userid/runnables/:id/files/:fileid/files', fetchuser, getmountedfiles);
var writemountedfiles = function (req, res) {
  res.json(403, { message: 'mounted file-system is read-only' });
};
app.post('/users/me/runnables/:id/files/:fileid/files', writemountedfiles);
app.post('/users/:userid/runnables/:id/files/:fileid/files', fetchuser, writemountedfiles);