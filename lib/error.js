module.exports = function error (code, msg) {
  var e = new Error(msg);
  e.msg = msg;
  e.code = code;
  return e;
};