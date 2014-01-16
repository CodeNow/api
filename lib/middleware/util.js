module.exports = {
  message: function (msg) {
    return function (req, res) {
      res.json({ message: msg });
    };
  }
};