'use strict'

var session = require('express-session')
var RedisStore = require('connect-redis')(session)

var store = new RedisStore({
  client: require('models/redis'),
  db: 1,//'sessions',
  prefix: process.env.REDIS_SESSION_STORE_PREFIX,
  ttl: process.env.TOKEN_EXPIRES,
  logErrors: true
})

module.exports = session({
  store: store,
  secret: process.env.COOKIE_SECRET,
  cookie: {
    httpOnly: true,
    domain: process.env.COOKIE_DOMAIN,
    secure: process.env.ASSERT_HTTPS === 'true'
  },
  unset: 'destroy',
  resave: false,
  saveUninitialized: false,
  proxy: true
})
