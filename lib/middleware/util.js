module.exports = {
  message: function (msg) {
    return function (req, res) {
      res.json({ message: msg });
    };
  },
  pause: function (req, res, next) {
    req.pause();
  },
  encodeId: function (id) {
    return new Buffer(id.toString(), 'hex').toString('base64').replace(plus, '-').replace(slash, '_');
  }
};

var plus = /\+/g;
var slash = /\//g;