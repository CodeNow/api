var configs = require('./configs');
var domain = require('domain');
var dockerExp = /^HTTP response code is (\d\d\d) which indicates an error: (.+)$/;
module.exports = function (parentDomain) {
  return function (req, res, next) {
    var d = domain.create();
    req.domain = d;
    if (parentDomain) {
      parentDomain.add(d);
      req.parentDomain = parentDomain;
    }
    d.add(req);
    d.add(res);
    d.on('error', function (e) {
      if (parentDomain && configs.throwErrors && false) {
        throw e;
      } else if (e.message && dockerExp.test(e.message)) {
        var parts = dockerExp.exec(e.message);
        var code = parts[1];
        var message = parts[2];
        if (code >= 500) {
          code = 502;
        }
        res.json(code, { message: message });
      } else {
        next(e);
      }
    });
    return d.run(next);
  };
};