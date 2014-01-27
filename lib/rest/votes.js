var express = require('express');
var app = module.exports = express();
var users = require('middleware/users');
var votes = require('middleware/votes');
var tokens = require('middleware/tokens');
var utils = require('middleware/utils');
var images = require('middleware/images');
var me = require('middleware/me');
var params = require('middleware/params');
var body = require('middleware/body');

app.use(tokens.hasToken);
app.use(me.findMe);

app.get('/', votes.getVotes);
app.post('/',
  body.require('runnable'),
  body.isObjectId64('runnable'),
  body.decodeId('runnable'),
  images.findById('body.runnable'),
  images.checkFound,
  votes.meVoteOn('image'),
  votes.respond);

app.del('/:voteId',
  votes.removeVote,
  utils.message('removed vote'));