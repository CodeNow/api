var async = require('async');
var configs = require('../configs');
var formidable = require('formidable');
var User = require('../models/users');
var images = require('../models/images');
var runnables = require('../models/runnables');
var _ = require('lodash');
var bcrypt = require('bcrypt');
var error = require('../error');
var utils = require('./utils');

var users = module.exports = {
  fetchSelf: function (req, res, next) {
    User.findById(req.user_id, function (err, user) {
      if (err || !user) {
        res.json(401, { message: 'user not found' });
      } else {
        req.self = user;
        next();
      }
    });
  },
  fetchUser: function (req, res, next) {
    if (req.params.userid && req.params.userid !== 'me') {
      if (!utils.equalObjectIds(req.params.userid, req.user_id) && !req.self.isModerator) {
        users.isModerator(req, res, next);
      } else {
        User.findById(req.user_id, function (err, user) {
          if (err || !user) {
            res.json(404, { message: 'user not found' });
          } else {
            req.user = user;
            next();
          }
        });
      }
    } else {
      req.user = req.self;
      next();
    }
  },
  createSelf: function (req, res, next) {
    req.self = new User();
    req.user = req.self;
    res.code = 201;
    next();
  },
  isVerified: function (req, res, next) {
    if (!req.self.isVerified) {
      next(error(403, 'access denied'));
    } else {
      next();
    }
  },
  isModerator: function (req, res, next) {
    if (!req.self.isModerator) {
      next(error(403, 'access denied'));
    } else {
      next();
    }
  },
  isContainerOwner: function (req, res, next) {
    if (!utils.equalObjectIds(container.owner, req.user_id)) {
      next(error(403, 'access denied'));
    }
    else {
      next();
    }
  },
  isImageOwner: function (req, res, next) {
    if (!utils.equalObjectIds(req.image.owner, req.user_id)) {
      next(error(403, 'access denied'));
    }
    else {
      next();
    }
  },
  queryUsers: function (req, res, next) {
    var sendUsers = req.domain.intercept(function (users) {
      res.json(users);
    });
    if (req.query.ids) {
      var userIds = [].concat(req.query.ids);
      User.publicListWithIds(req.domain, userIds, sendUsers);
    } else if (req.query.username) {
      User.publicList(req.domain, { lower_username: req.query.username.toLowerCase() }, sendUsers);
    } else if (req.query.channel) {
      User.channelLeaders(req.domain, req.query.channel, req.query.idsOnly, sendUsers);
    } else {
      res.json(400, { message: 'must provide ids or username for users to get' });
    }
  },
  returnUser: function (req, res) {
    var json_user = req.user.toJSON();
    json_user.votes = req.user.getVotes();
    delete json_user.password;
    if (req.self === req.user) {
      json_user.access_token = req.access_token;
    }
    images.count({ owner: req.user._id }, req.domain.intercept(function (imagesCount) {
      json_user.imagesCount = imagesCount;
      res.json(res.code || 200, json_user);
    }));
  },
  delUser: function (req, res, next) {
    req.user.remove(req.domain.intercept(next));
  },
  saveUser: function (req, res, next) {
    if (!req.self.isModerator) {
      var allowed = [
        'name',
        'company',
        'show_email',
        'initial_referrer',
        'email',
        'username',
        'password'
      ];
      _.extend(req.user, _.pick(req.body, allowed));
    } else {
      _.extend(req.user, req.body);
    }
    if (req.body.username || req.body.email || req.body.password) {
      users.register(req, res, next);
    } else {
      req.user.save(next);
    }
  },
  register: function (req, res, next) {
    if (req.body.email == null) {
      res.json(400, { message: 'must provide an email to register with' });
    } else if (req.body.username == null) {
      res.json(400, { message: 'must provide a username to register with' });
    } else if (req.body.password == null) {
      res.json(400, { message: 'must provide a password to register with' });
    } else {
      async.waterfall([
        findConflicts,
        checkConflicts,
        hashPassword,
        save
      ], next);
    }
    function findConflicts (cb) {
      User.findOne({
        $or: [
          { email: req.user.email },
          { username: req.user.username }
        ]
      }, cb);
    }
    function checkConflicts (user, cb) {
      if (user) {
        var collision = req.user.email === user.email ? 'email' : 'username';
        cb(error(409, collision + ' already exists'));
      } else {
        cb();
      }
    }
    function hashPassword (cb) {
      bcrypt.hash(req.user.password + configs.passwordSalt, 10, cb);
    }
    function save (password, cb) {
      req.user.password = password;
      if (req.user.permission_level > 0) {
        req.user.permission_level = 1;
      }
      req.user.lower_username = req.user.username.toLowerCase();
      req.user.save(next);
    }
  },
  getvotes: function (req, res) {
    res.json(req.user.getVotes());
  },
  postvote: function (req, res) {
    if (req.body.runnable == null) {
      res.json(400, { message: 'must include runnable to vote on' });
    } else {
      runnables.vote(req.domain, req.user_id, req.body.runnable, req.domain.intercept(function (vote) {
        res.json(201, vote);
      }));
    }
  },
  removevote: function (req, res, next) {
    req.user.removeVote(req.domain, req.params.voteid, req.domain.intercept(function () {
      res.json({ message: 'removed vote' });
    }));
  },
  // postrunnable: function (req, res) {
  //   if (req.query.from == null) {
  //     res.json(400, { message: 'must provide a runnable to fork from' });
  //   } else {
  //     runnables.createContainer(req.domain, req.user_id, req.query.from, req.domain.intercept(function (container) {
  //       res.json(201, container);
  //     }));
  //   }
  // },
  // getrunnables: function (req, res) {
  //   var query = _.pick(req.query, 'parent', 'saved');
  //   runnables.listContainers(req.domain, req.user_id, query, req.domain.intercept(function (containers) {
  //     res.json(containers);
  //   }));
  // },
  // getrunnable: function (req, res) {
  //   runnables.getContainer(req.domain, req.user_id, req.params.runnableid, req.domain.intercept(function (container) {
  //     res.json(container);
  //   }));
  // },
  // putrunnable: function (req, res) {
  //   var required = [
  //     'name',
  //     'description'
  //   ];
  //   var optional = [
  //     'specification',
  //     'saved',
  //     'start_cmd',
  //     'build_cmd',
  //     'output_format',
  //     'status',
  //     'commit_error',
  //     'service_cmds'
  //   ];
  //   var set = {};
  //   for (var _i = 0, _len = required.length; _i < _len; _i++) {
  //     var attr = required[_i];
  //     if (req.body[attr] === void 0) {
  //       return res.json(400, { message: 'must provide a runnable ' + attr });
  //     } else {
  //       set[attr] = req.body[attr];
  //     }
  //   }
  //   optional.forEach(function (attr) {
  //     if (req.body[attr] !== void 0) {
  //       set[attr] = req.body[attr];
  //     }
  //   });
  //   runnables.updateContainer(req.domain, req.user_id, req.params.runnableid, set, req.get('runnable-token'), req.domain.intercept(function (runnable) {
  //     res.json(runnable);
  //   }));
  // },
  // patchrunnable: function (req, res) {
  //   var set = _.pick(req.body, 'name', 'description', 'specification', 'saved', 'start_cmd', 'build_cmd', 'output_format', 'status', 'commit_error', 'service_cmds');
  //   runnables.updateContainer(req.domain, req.user_id, req.params.runnableid, set, req.get('runnable-token'), req.domain.intercept(function (runnable) {
  //     res.json(runnable);
  //   }));
  // },
  // delrunnable: function (req, res) {
  //   return runnables.removeContainer(req.domain, req.user_id, req.params.runnableid, function (err) {
  //     if (err) {
  //       return res.json(err.code, { message: err.msg });
  //     } else {
  //       return res.json({ message: 'runnable deleted' });
  //     }
  //   });
  // },
  // gettags: function (req, res) {
  //   runnables.getContainerTags(req.domain, req.params.id, req.domain.intercept(function (tags) {
  //     res.json(tags);
  //   }));
  // },
  // posttag: function (req, res) {
  //   if (req.body.name == null) {
  //     res.json(400, { message: 'tag must include a name field' });
  //   } else {
  //     runnables.addContainerTag(req.domain, req.user_id, req.params.id, req.body.name, req.domain.intercept(function (tag) {
  //       res.json(201, tag);
  //     }));
  //   }
  // },
  // gettag: function (req, res) {
  //   runnables.getContainerTag(req.domain, req.params.id, req.params.tagId, req.domain.intercept(function (tag) {
  //     res.json(tag);
  //   }));
  // },
  // deltag: function (req, res) {
  //   runnables.removeContainerTag(req.domain, req.user_id, req.params.id, req.params.tagId, req.domain.intercept(function () {
  //     res.json({ message: 'tag deleted' });
  //   }));
  // },
  // listfiles: function (req, res) {
  //   var content = req.query.content != null;
  //   var dir = req.query.dir != null;
  //   var default_tag = req.query['default'] != null;
  //   var path = req.query.path;
  //   runnables.listFiles(req.domain, req.user_id, req.params.runnableid, content, dir, default_tag, path, req.domain.intercept(function (files) {
  //     res.json(files);
  //   }));
  // },
  // syncfiles: function (req, res) {
  //   runnables.syncFiles(req.domain, req.user_id, req.params.id, req.domain.intercept(function () {
  //     res.json(201, {
  //       message: 'files synced successfully',
  //       date: new Date()
  //     });
  //   }));
  // },
  // createfile: function (req, res, next) {
  //   var contentType = req.headers['content-type'];
  //   if (contentType === 'application/json') {
  //     if (req.body.dir) {
  //       createDir();
  //     } else {
  //       createFile();
  //     }
  //   } else {
  //     if (/multipart\/form-data/.test(contentType)) {
  //       multipart();
  //     } else {
  //       res.json(400, { message: 'content type must be application/json or multipart/form-data' });
  //     }
  //   }
  //   function createDir () {
  //     if (req.body.name == null) {
  //       res.json(400, { message: 'dir must include a name field' });
  //     } else if (req.body.path == null) {
  //       res.json(400, { message: 'dir must include a path field' });
  //     } else {
  //       runnables.createDirectory(req.domain, req.user_id, req.params.id, req.body.name, req.body.path, req.domain.intercept(function (dir) {
  //         res.json(201, dir);
  //       }));
  //     }
  //   }
  //   function createFile () {
  //     if (req.body.name == null) {
  //       res.json(400, { message: 'file must include a name field' });
  //     } else if (req.body.content == null) {
  //       res.json(400, { message: 'file must include a content field' });
  //     } else if (req.body.path == null) {
  //       res.json(400, { message: 'file must include a path field' });
  //     } else {
  //       runnables.createFile(req.domain, req.user_id, req.params.id, req.body.name, req.body.path, req.body.content, req.domain.intercept(function (file) {
  //         res.json(201, file);
  //       }));
  //     }
  //   }
  //   function multipart () {
  //     var form = new formidable.IncomingForm();
  //     form.parse(req, req.domain.intercept(function (fields, files) {
  //       var files_array = [];
  //       for (var key in files) {
  //         var file = files[key];
  //         files_array.push(file);
  //       }
  //       async.mapSeries(files_array, function (file, cb) {
  //         var filestream = fs.createReadStream(file.path);
  //         filestream.pause();
  //         runnables.createFile(req.domain, req.user_id, req.params.id, file.name, '/', filestream, cb);
  //       }, req.domain.intercept(function (files) {
  //         res.json(201, files);
  //       }));
  //     }));
  //   }
  // },
  // streamupdate: function (req, res, next) {
  //   var contentType = req.headers['content-type'];
  //   if (/multipart\/form-data/.test(contentType)) {
  //     var form = new formidable.IncomingForm();
  //     form.parse(req, req.domain.intercept(function (fields, files) {
  //       var files_array = [];
  //       for (var key in files) {
  //         var file = files[key];
  //         files_array.push(file);
  //       }
  //       async.mapSeries(files_array, function (file, cb) {
  //         var filestream = fs.createReadStream(file.path);
  //         filestream.pause();
  //         runnables.updateFileContents(req.domain, req.user_id, req.params.id, '/' + file.name, filestream, cb);
  //       }, req.domain.intercept(function (files) {
  //         res.json(200, files);
  //       }));
  //     }));
  //   } else {
  //     res.json(400, { message: 'content type must be application/json or multipart/form-data' });
  //   }
  // },
  // createindir: function (req, res, next) {
  //   var contentType = req.headers['content-type'];
  //   if (/multipart\/form-data/.test(contentType)) {
  //     var form = new formidable.IncomingForm();
  //     form.parse(req, req.domain.intercept(function (fields, files) {
  //       var files_array = [];
  //       for (var key in files) {
  //         var file = files[key];
  //         files_array.push(file);
  //       }
  //       runnables.readFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.domain.intercept(function (root) {
  //         if (!root.dir) {
  //           res.json(403, { message: 'resource is not of directory type' });
  //         } else {
  //           async.mapSeries(files_array, function (file, cb) {
  //             var filestream = fs.createReadStream(file.path);
  //             filestream.pause();
  //             runnables.createFile(req.domain, req.user_id, req.params.id, file.name, '' + root.path + '/' + root.name, filestream, cb);
  //           }, req.domain.intercept(function (files) {
  //             res.json(201, files);
  //           }));
  //         }
  //       }));
  //     }));
  //   } else {
  //     return res.json(400, { message: 'content type must be multipart/form-data' });
  //   }
  // },
  // getfile: function (req, res) {
  //   runnables.readFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.domain.intercept(function (file) {
  //     res.json(file);
  //   }));
  // },
  // updatefile: function (req, res, next) {
  //   var contentType = req.headers['content-type'];
  //   if (contentType === 'application/json') {
  //     async.waterfall([
  //       function (cb) {
  //         var file = null;
  //         if (req.body.content == null) {
  //           cb(null, file);
  //         } else {
  //           runnables.updateFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.body.content, cb);
  //         }
  //       },
  //       function (file, cb) {
  //         if (req.body.path == null) {
  //           cb(null, file);
  //         } else {
  //           runnables.moveFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.body.path, cb);
  //         }
  //       },
  //       function (file, cb) {
  //         if (req.body.name == null) {
  //           cb(null, file);
  //         } else {
  //           runnables.renameFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.body.name, cb);
  //         }
  //       },
  //       function (file, cb) {
  //         if (req.body['default'] == null) {
  //           cb(null, file);
  //         } else {
  //           runnables.defaultFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.body['default'], cb);
  //         }
  //       }
  //     ], req.domain.intercept(function (file) {
  //       if (!file) {
  //         res.json(400, { message: 'must provide content, name, path or tag to update operation' });
  //       } else {
  //         res.json(file);
  //       }
  //     }));
  //   } else {
  //     if (/multipart\/form-data/.test(contentType)) {
  //       var form = new formidable.IncomingForm();
  //       form.parse(req, req.domain.intercept(function (fields, files) {
  //         var files_array = [];
  //         for (var key in files) {
  //           var file = files[key];
  //           files_array.push(file);
  //         }
  //         runnables.readFile(req.domain, req.user_id, req.params.id, req.params.fileid, req.domain.intercept(function (root) {
  //           if (!root.dir) {
  //             res.json(403, { message: 'resource is not of directory type' });
  //           } else {
  //             async.mapSeries(files_array, function (file, cb) {
  //               var filestream = fs.createReadStream(file.path);
  //               filestream.pause();
  //               runnables.updateFileContents(req.domain, req.user_id, req.params.id, '' + root.path + '/' + root.name + '/' + file.name, filestream, cb);
  //             }, req.domain.intercept(function (files) {
  //               res.json(200, files);
  //             }));
  //           }
  //         }));
  //       }));
  //     } else {
  //       res.json(400, { message: 'content type must be application/json or multipart/form-data' });
  //     }
  //   }
  // },
  // deletefile: function (req, res) {
  //   var recursive = req.query.recursive != null ? req.query.recursive : true;
  //   runnables.deleteFile(req.domain, req.user_id, req.params.id, req.params.fileid, recursive, req.domain.intercept(function () {
  //     res.json({ message: 'file deleted' });
  //   }));
  // },
  // getmountedfiles: function (req, res) {
  //   var mountDir = req.query.path || '/';
  //   runnables.getMountedFiles(req.domain, req.user_id, req.params.id, req.params.fileid, mountDir, req.domain.intercept(function (files) {
  //     res.json(files);
  //   }));
  // },
  // writemountedfiles: function (req, res) {
  //   res.json(403, { message: 'mounted file-system is read-only' });
  // }
};