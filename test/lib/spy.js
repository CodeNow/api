module.exports.func = function (fn, ctx, cb) {
  cb = Array.prototype.slice.call(arguments).pop();
  if (cb === ctx) {
    ctx = null;
  }
  return function () {
    fn.apply(ctx, arguments);
    cb(); // callback to confirm the function was invoked
  };
};

module.exports.classMethod = function (Class, method, cb) {
  var self = this;
  var origMethod = Class.prototype[method];
  var proxy = function () {
    origMethod.apply(this, arguments);
    cb(); // callback to confirm the function was invoked
  };
  Class.prototype[method] = proxy;
};
