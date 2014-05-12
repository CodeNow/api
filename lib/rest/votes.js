'use strict';

// FIXME: we need to vote on projects
// var express = require('express');
// var app = module.exports = express();
// var votes = require('middleware/votes');
// var tokens = require('middleware/tokens');
// var utils = require('middleware/utils');
// var images = require('middleware/images');
// var me = require('middleware/me');
// var body = require('middleware/body');

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
