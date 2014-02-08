var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var users = require('middleware/users');
var tokens = require('middleware/tokens');
var query = require('middleware/query');
var body = require('middleware/body');
var params = require('middleware/params');
var utils = require('middleware/utils');
var or = utils.or;
var series = utils.series;
var ternary = utils.ternary;

app.use('/me/votes', require('./votes'));

app.post('/',
  me.create(),
  tokens.createToken,
  me.model.save(),
  me.respond);

app.all('*', tokens.hasToken);

app.get('/',
  query.pickAndRequireOne('_id', 'channel', 'username'),
  query.ifExists('_id',
    or(query.isObjectId('_id'), query.isObjectIdArray('_id')),
    query.castAsMongoQuery(),
    users.publicFind('query'),
    users.respond),
  query.ifExists('username',
    users.publicFind('query'),
    users.respond));

app.get('/:userId',
  params.replaceMeWithMyId('userId'),
  ternary(or(me.isUser, me.isModerator),
    users.findById('params.userId'),
    users.publicFindById('params.userId')),
  users.respond);

app.del('/:userId',
  params.replaceMeWithMyId('userId'),
  or(me.isUser, me.isModerator),
  users.remove({ _id: 'params.userId' }),
  utils.message('user deleted'));

var updateUser = series(
  params.replaceMeWithMyId('userId'),
  or(me.isUser, me.isModerator),
  body.pickAndRequireOne(
    'name',
    'company',
    'show_email',
    'initial_referrer',
    'email', 'username', 'password'),
  body.ifOneExists(['email', 'username', 'password'],
    me.register,
    me.respond),
  users.findByIdAndUpdate('params.userId', 'body'),
  users.respond);

app.put('/:userId', updateUser);

app.patch('/:userId', updateUser);