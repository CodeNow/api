var configs = require('./configs');

module.exports = function error (code, msg) {
  var e = new Error(msg);
  e.msg = msg || 'something bad happened :(';
  e.code = code;
  e.data = {};
  e.isResponseError = true;
  return e;
};
module.exports.log = function (err) {
  if (!err) { return; }
  console.error(err);
  rollbar.reportMessage(err.message, 'error');
};
