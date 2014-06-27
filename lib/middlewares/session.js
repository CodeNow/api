'use strict';

var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var configs = require('configs');

var store = new RedisStore({
  client: require('models/redis'),
  ttl: configs.tokenExpires,
  db: 'sessions'
});

module.exports = session({
  store: store,
  secret: configs.cookieSecret,
  cookie: {
    httpOnly: false
  }
});