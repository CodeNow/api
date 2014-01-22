module.exports = function error (code, msg) {
  var e = new Error(msg);
  e.msg = msg || 'something bad happened :(';
  e.code = code;
  e.isResponseError = true;
  return e;
};
