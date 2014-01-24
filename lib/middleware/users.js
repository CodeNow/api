var async = require('async');
var configs = require('configs');
var User = require('models/users');
var _ = require('lodash');
var bcrypt = require('bcrypt');
var error = require('error');
var utils = require('middleware/utils');

var users = module.exports = {
  fetchSelf: function (req, res, next) {
    if (req.self) {
      return next();
    }
    replaceMeWithUserId(req);
    if (!req.user_id) {
      throw new Error('NO USER_ID');
    }
    User.findById(req.user_id, req.domain.intercept(function (user) {
      if (!user) {
        return next(error(401, 'user not found'));
      }
      req.self = user;
      if (req.params && utils.equalObjectIds(req.params.userId, req.user_id)) {
        req.user = req.self;
      }
      next();
    }));
  },
  fetchUser: function (req, res, next) {
    if (req.user) {
      return next();
    }
    replaceMeWithUserId(req);
    User.findById(req.params.userId, req.domain.intercept(function (user) {
      if (!user) {
        return next(error(404, 'user not found'));
      }
      req.user = user;
      next();
    }));
  },
  fetchPublicUser: function (req, res, next) {
    if (req.user) {
      return next();
    }
    replaceMeWithUserId(req);
    User.publicFindById(req.params.userId, req.domain.intercept(function (user) {
      if (!user) {
        return next(error(404, 'user not found'));
      }
      req.user = user;
      next();
    }));
  },
  createSelf: function (req, res, next) {
    req.self = new User();
    req.user = req.self;
    res.code = 201;
    next();
  },
  isUser: function (req, res, next) {
    replaceMeWithUserId(req);
    if (!utils.equalObjectIds(req.params.userId, req.user_id)) {
      return next(error(403, 'access denied'));
    }
    next();
  },
  isVerified: function (req, res, next) {
    users.fetchSelf(req, res, req.domain.intercept(function () {
      if (!req.self.isVerified) {
        next(error(403, 'access denied'));
      } else {
        next();
      }
    }));
  },
  isModerator: function (req, res, next) {
    users.fetchSelf(req, res, req.domain.intercept(function () {
      if (!req.self.isModerator) {
        next(error(403, 'access denied'));
      } else {
        next();
      }
    }));
  },
  isContainerOwner: function (req, res, next) {
    if (!utils.equalObjectIds(req.container.owner, req.user_id)) {
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
  isSpecificationOwner: function (req, res, next) {
    if (!utils.equalObjectIds(req.specification.owner, req.user_id)) {
      next(error(403, 'access denied'));
    }
    else {
      next();
    }
  },
  queryUsers: function (req, res, next) {
    var domain = req.domain;
    var returnUsers = domain.intercept(function (users) {
      async.map(users, function (user, cb) {
        user.returnJSON(cb);
      },
      domain.intercept(function (users) {
        res.json(users);
      }));
    });
    if (req.query.channel) {// special case
      User.channelLeaders(domain, req.query.channel, req.query.idsOnly, returnUsers);
    }
    else {
      var query = _.clone(req.query);
      Object.keys(query).forEach(function (key) {
        var val = query[key];
        if (Array.isArray(val)) {
          query[key] = { $in: val };
        }
      });
      User.publicFind(query, returnUsers);
    }
  },
  returnUser: function (req, res) {
    req.user.returnJSON(req.domain.intercept(function (json) {
      if (utils.equalObjectIds(req.self._id, json._id)) {
        json.access_token = req.access_token;
      }
      res.json(res.code || 200, json);
    }));
  },
  delUser: function (req, res, next) {
    req.user.remove(req.domain.intercept(next));
  },
  saveUser: function (req, res, next) {
    req.user.set(req.body);
    if (req.body.username || req.body.email || req.body.password) {
      users.register(req, res, next);
    } else {
      req.user.save(req.domain.intercept(function (user) {
        req.user = user;
        next();
      }));
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
          { lower_username: req.user.lower_username }
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
      var user = req.user;
      user.password = password;
      if (user.permission_level === 0) {
        user.permission_level = 1;
        user.registered = true;
      }
      user.save(req.domain.intercept(function (user) {
        req.user = user;
        next();
      }));
    }
  },
  findByUsernameOrEmail: function (req, res, next) {
    var or = [];
    if (req.body.username) {
      or.push({ username: req.body.username });
    }
    if (req.body.email) {
      or.push({ email: req.body.email });
    }
    User.findOne({
      $or: or
    }, req.domain.intercept(function (user) {
      if (!user) {
        next(error(404, 'user not found'));
      } else {
        req.user = user;
        next();
      }
    }));
  },
  checkPassword: function (req, res, next) {
    if (configs.passwordSalt) {
      bcrypt.compare(req.body.password + configs.passwordSalt, req.user.password,
        req.domain.intercept(function (matches) {
          if (!matches) {
            next(error(403, 'invalid password'));
          } else {
            next();
          }
        }));
    } else {
      throw Error ('no salt');
    }
  }
};

function replaceMeWithUserId (req) {
  if (!req.params) {
    req.params = {
      userId: req.user_id
    };
  }
  else if (req.params.userId === 'me') {
    req.params.userId = req.user_id;
  }
}
