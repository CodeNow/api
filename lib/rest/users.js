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

// app.post('/me/runnables', tokens.hasToken, postrunnable);
// app.post('/:userid/runnables', tokens.hasToken, users.fetchUser, postrunnable);

// app.get('/me/runnables', tokens.hasToken, getrunnables);
// app.get('/:userid/runnables', tokens.hasToken, users.fetchUser, getrunnables);

// app.get('/me/runnables/:runnableid', tokens.hasToken, getrunnable);
// app.get('/:userid/runnables/:runnableid', tokens.hasToken, users.fetchUser, getrunnable);

// app.put('/me/runnables/:runnableid', tokens.hasToken, putrunnable);
// app.put('/:userid/runnables/:runnableid', tokens.hasToken, users.fetchUser, putrunnable);

// app.patch('/me/runnables/:runnableid', tokens.hasToken, patchrunnable);
// app.patch('/:userid/runnables/:runnableid', tokens.hasToken, users.fetchUser, patchrunnable);

// app.del('/me/runnables/:runnableid', tokens.hasToken, delrunnable);
// app.del('/:userid/runnables/:runnableid', tokens.hasToken, users.fetchUser, delrunnable);

// app.get('/me/runnables/:id/tags', tokens.hasToken, gettags);
// app.get('/:userid/runnables/:id/tags', tokens.hasToken, users.fetchUser, gettags);

// app.post('/me/runnables/:id/tags', tokens.hasToken, posttag);
// app.post('/:userid/runnables/:id/tags', tokens.hasToken, users.fetchUser, posttag);

// app.get('/me/runnables/:id/tags/:tagId', tokens.hasToken, gettag);
// app.get('/:userid/runnables/:id/tags/:tagId', tokens.hasToken, users.fetchUser, gettag);

// app.del('/me/runnables/:id/tags/:tagId', tokens.hasToken, deltag);
// app.del('/:userid/runnables/:id/tags/:tagId', tokens.hasToken, users.fetchUser, deltag);

// app.get('/me/runnables/:runnableid/files', tokens.hasToken, listfiles);
// app.get('/:userid/runnables/:runnableid/files', tokens.hasToken, users.fetchUser, listfiles);

// app.post('/me/runnables/:id/sync', tokens.hasToken, syncfiles);
// app.post('/:userid/runnables/:id/sync', tokens.hasToken, users.fetchUser, syncfiles);

// app.post('/me/runnables/:id/files/', tokens.hasToken, createfile);
// app.post('/me/runnables/:id/files', tokens.hasToken, createfile);
// app.post('/:userid/runnables/:id/files/', tokens.hasToken, users.fetchUser, createfile);
// app.post('/:userid/runnables/:id/files', tokens.hasToken, users.fetchUser, createfile);

// app.put('/me/runnables/:id/files', tokens.hasToken, streamupdate);
// app.put('/:userid/runnables/:id/files', tokens.hasToken, users.fetchUser, streamupdate);

// app.post('/me/runnables/:id/files/:fileid', tokens.hasToken, createindir);
// app.post('/:userid/runnables/:id/files/:fileid', tokens.hasToken, users.fetchUser, createindir);

// app.get('/me/runnables/:id/files/:fileid', tokens.hasToken, getfile);
// app.get('/:userid/runnables/:id/files/:fileid', tokens.hasToken, users.fetchUser, getfile);

// app.put('/me/runnables/:id/files/:fileid', tokens.hasToken, updatefile);
// app.patch('/me/runnables/:id/files/:fileid', tokens.hasToken, updatefile);
// app.put('/:userid/runnables/:id/files/:fileid', tokens.hasToken, users.fetchUser, updatefile);
// app.patch('/:userid/runnables/:id/files/:fileid', tokens.hasToken, users.fetchUser, updatefile);

// app.del('/me/runnables/:id/files/:fileid', tokens.hasToken, deletefile);
// app.del('/:userid/runnables/:id/files/:fileid', tokens.hasToken, users.fetchUser, deletefile);

// app.get('/me/runnables/:id/files/:fileid/files', tokens.hasToken, getmountedfiles);
// app.get('/:userid/runnables/:id/files/:fileid/files', tokens.hasToken, users.fetchUser, getmountedfiles);

// app.post('/me/runnables/:id/files/:fileid/files', tokens.hasToken, writemountedfiles);
// app.post('/:userid/runnables/:id/files/:fileid/files', tokens.hasToken, users.fetchUser, writemountedfiles);