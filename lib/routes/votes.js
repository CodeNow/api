'use strict';

// FIXME: we need to vote on projects
// var express = require('express');
// var app = module.exports = express();
// var votes = require('middlewares/votes');
// var tokens = require('middlewares/tokens');
// var utils = require('middlewares/utils');
// var images = require('middlewares/images');
// var me = require('middlewares/me');
// var body = require('middlewares/body');

// app.use(tokens.hasToken);
// app.use(me.findMe);

// app.get('/', votes.getVotes);
// app.post('/',
//   body.require('runnable'),
//   body.isObjectId64('runnable'),
//   body.decodeId('runnable'),
//   images.findById('body.runnable'),
//   images.checkFound,
//   votes.meVoteOn('image'),
//   votes.respond);

// app.delete('/:voteId',
//   votes.removeVote,
//   utils.message('removed vote'));
