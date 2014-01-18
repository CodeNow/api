var express = require('express');
var app = module.exports = express();
var users = require('../middleware/users');
var tokens = require('../middleware/tokens');
app.use(tokens.hasToken);
app.use(users.fetchSelf);
app.use(users.fetchUser);

app.get('/', users.getvotes);
app.post('/', users.postvote);
app.del('/:voteid', users.removevote);