'use strict';

var session = require('express-session');
var RedisStore = require('connect-redis')(session);

var store = new RedisStore({
  client: require('models/redis'),
  ttl: process.env.TOKEN_EXPIRES,
  db: 'sessions'
});

module.exports = session({
  store: store,
  secret: process.env.COOKIE_SECRET,
  cookie: {
    httpOnly: false
  },
  resave: true, // default
  saveUninitialized: true // default
});
