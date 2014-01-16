var express = require('express');
var app = module.exports = express();
var users = require('../middleware/users');
var auth = require('../middleware/auth');
var util = require('../middleware/util');
app.post('/',
  users.postuser);

app.get('/',
  auth.hasToken,
  users.getusers);

app.get('/me',
  auth.hasToken,
  users.fetchUser,
  users.getuser);
app.get('/:userid',
  auth.hasToken,
  users.fetchUser,
  users.getuser);

app.del('/me',
  auth.hasToken,
  users.fetchUser,
  users.deluser,
  util.message('user deleted'));
app.del('/:userid',
  auth.hasToken,
  users.fetchUser,
  users.deluser,
  util.message('user deleted'));

app.put('/me',
  auth.hasToken,
  users.fetchUser,
  users.putuser,
  users.getuser);
app.put('/:userid',
  auth.hasToken,
  users.fetchUser,
  users.putuser,
  users.getuser);

app.patch('/me', auth.hasToken, users.fetchUser, users.patchuser, users.getuser);
app.patch('/:userid', auth.hasToken, users.fetchUser, users.patchuser, users.getuser);

// app.get('/me/votes', auth.hasToken, getvotes);
// app.get('/:userid/votes', auth.hasToken, users.fetchUser, getvotes);

// app.post('/me/votes', auth.hasToken, postvote);
// app.post('/:userid/votes', auth.hasToken, users.fetchUser, postvote);

// app.del('/me/votes/:voteid', auth.hasToken, removevote);
// app.del('/:userid/votes/:voteid', auth.hasToken, users.fetchUser, removevote);

// app.post('/me/runnables', auth.hasToken, postrunnable);
// app.post('/:userid/runnables', auth.hasToken, users.fetchUser, postrunnable);

// app.get('/me/runnables', auth.hasToken, getrunnables);
// app.get('/:userid/runnables', auth.hasToken, users.fetchUser, getrunnables);

// app.get('/me/runnables/:runnableid', auth.hasToken, getrunnable);
// app.get('/:userid/runnables/:runnableid', auth.hasToken, users.fetchUser, getrunnable);

// app.put('/me/runnables/:runnableid', auth.hasToken, putrunnable);
// app.put('/:userid/runnables/:runnableid', auth.hasToken, users.fetchUser, putrunnable);

// app.patch('/me/runnables/:runnableid', auth.hasToken, patchrunnable);
// app.patch('/:userid/runnables/:runnableid', auth.hasToken, users.fetchUser, patchrunnable);

// app.del('/me/runnables/:runnableid', auth.hasToken, delrunnable);
// app.del('/:userid/runnables/:runnableid', auth.hasToken, users.fetchUser, delrunnable);

// app.get('/me/runnables/:id/tags', auth.hasToken, gettags);
// app.get('/:userid/runnables/:id/tags', auth.hasToken, users.fetchUser, gettags);

// app.post('/me/runnables/:id/tags', auth.hasToken, posttag);
// app.post('/:userid/runnables/:id/tags', auth.hasToken, users.fetchUser, posttag);

// app.get('/me/runnables/:id/tags/:tagId', auth.hasToken, gettag);
// app.get('/:userid/runnables/:id/tags/:tagId', auth.hasToken, users.fetchUser, gettag);

// app.del('/me/runnables/:id/tags/:tagId', auth.hasToken, deltag);
// app.del('/:userid/runnables/:id/tags/:tagId', auth.hasToken, users.fetchUser, deltag);

// app.get('/me/runnables/:runnableid/files', auth.hasToken, listfiles);
// app.get('/:userid/runnables/:runnableid/files', auth.hasToken, users.fetchUser, listfiles);

// app.post('/me/runnables/:id/sync', auth.hasToken, syncfiles);
// app.post('/:userid/runnables/:id/sync', auth.hasToken, users.fetchUser, syncfiles);

// app.post('/me/runnables/:id/files/', auth.hasToken, createfile);
// app.post('/me/runnables/:id/files', auth.hasToken, createfile);
// app.post('/:userid/runnables/:id/files/', auth.hasToken, users.fetchUser, createfile);
// app.post('/:userid/runnables/:id/files', auth.hasToken, users.fetchUser, createfile);

// app.put('/me/runnables/:id/files', auth.hasToken, streamupdate);
// app.put('/:userid/runnables/:id/files', auth.hasToken, users.fetchUser, streamupdate);

// app.post('/me/runnables/:id/files/:fileid', auth.hasToken, createindir);
// app.post('/:userid/runnables/:id/files/:fileid', auth.hasToken, users.fetchUser, createindir);

// app.get('/me/runnables/:id/files/:fileid', auth.hasToken, getfile);
// app.get('/:userid/runnables/:id/files/:fileid', auth.hasToken, users.fetchUser, getfile);

// app.put('/me/runnables/:id/files/:fileid', auth.hasToken, updatefile);
// app.patch('/me/runnables/:id/files/:fileid', auth.hasToken, updatefile);
// app.put('/:userid/runnables/:id/files/:fileid', auth.hasToken, users.fetchUser, updatefile);
// app.patch('/:userid/runnables/:id/files/:fileid', auth.hasToken, users.fetchUser, updatefile);

// app.del('/me/runnables/:id/files/:fileid', auth.hasToken, deletefile);
// app.del('/:userid/runnables/:id/files/:fileid', auth.hasToken, users.fetchUser, deletefile);

// app.get('/me/runnables/:id/files/:fileid/files', auth.hasToken, getmountedfiles);
// app.get('/:userid/runnables/:id/files/:fileid/files', auth.hasToken, users.fetchUser, getmountedfiles);

// app.post('/me/runnables/:id/files/:fileid/files', auth.hasToken, writemountedfiles);
// app.post('/:userid/runnables/:id/files/:fileid/files', auth.hasToken, users.fetchUser, writemountedfiles);