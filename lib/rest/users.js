var express = require('express');
var app = module.exports = express();
var users = require('../middleware/users');
var tokens = require('../middleware/tokens');
var query = require('../middleware/query');
var body = require('../middleware/body');
var utils = require('../middleware/utils');
var or = utils.or;
var series = utils.series;
var ternary = utils.ternary;

app.use('/me/votes', require('./votes'));

app.post('/',
  users.createSelf,
  tokens.createToken,
  users.saveUser,
  users.returnUser);

app.all('*', tokens.hasToken);

app.get('/',
  query.requireOne('_id', 'channel'),
  users.queryUsers);

app.get('/:userId',
  ternary(or(users.isUser, users.isModerator),
    users.fetchUser,
    users.fetchPublicUser),
  users.returnUser);

app.all('/:userId', // ALL
  or(users.isUser, users.isModerator),
  users.fetchUser);

app.del('/:userId',
  users.delUser,
  utils.message('user deleted'));

var updateUser = series(
  body.requireOne(
    'name',
    'company',
    'show_email',
    'initial_referrer',
    'email', 'username', 'password'),
  users.saveUser,
  users.returnUser);

app.put('/:userId', updateUser);

app.patch('/:userId', updateUser);