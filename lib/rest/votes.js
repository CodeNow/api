var express = require('express');
var app = module.exports = express();
var users = require('../middleware/users');
var votes = require('../middleware/votes');
var tokens = require('../middleware/tokens');
var utils = require('../middleware/utils');
var images = require('../middleware/images');
var params = require('../middleware/params');
app.use(tokens.hasToken);
app.use(users.fetchSelf);

app.get('/', votes.getVotes);
app.post('/',
  params.setFromBody('imageId', 'runnable'),
  images.fetchImage,
  votes.addVote,
  votes.returnVote);
app.del('/:voteid',
  votes.removeVote,
  utils.message('removed vote'));