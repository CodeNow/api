var express = require('express');
var app = module.exports = express();
var users = require('middleware/users');
var tokens = require('middleware/tokens');
var query = require('middleware/query');
var body = require('middleware/body');
var utils = require('middleware/utils');
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
  query.pickAndRequireOne('_id', 'channel', 'username'),
  query.if('channel',
    query.isObjectId('channel'),
    users.findChannelLeaders('query.channel'),
    users.respond),
  query.if('_id',
    or(query.isObjectId('_id'), query.isObjectIdArray('_id')),
    query.castAsMongoQuery(),
    users.publicFind('query'),
    users.respond),
  query.if('username',
    users.publicFind('query'),
    users.respond));

app.get('/:userId',
  ternary(or(users.isUser, users.isModerator),
    users.findById('params.userId'),
    users.publicFindById('params.userId')),
  users.respond);

app.all('/:userId', // ALL
  or(users.isUser, users.isModerator),
  users.findById('params.userId'));

app.del('/:userId',
  users.remove({ _id: 'user._id' }),
  utils.message('user deleted'));

var updateUser = series(
  body.pickAndRequireOne(
    'name',
    'company',
    'show_email',
    'initial_referrer',
    'email', 'username', 'password'),
  users.saveUser,
  users.returnUser);

app.put('/:userId', updateUser);

app.patch('/:userId', updateUser);