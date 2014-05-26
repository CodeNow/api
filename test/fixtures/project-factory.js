var uuid = require('uuid');
var isFunction = require('101/is-function');

module.exports = {
  createProjectBy: function (user, body, cb) {
    if (isFunction(body)) {
      cb = body;
      body = null;
    }
    body = body || {
      name: uuid(),
      dockerfile: 'FROM ubuntu\n'
    };
    var project = user.createProject({ json: body }, cb);
    return project;
  }
};