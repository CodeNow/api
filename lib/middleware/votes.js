var utils = require('middleware/utils');
module.exports = {
  getVotes: function (req, res) {
    res.json(req.self.getVotes());
  },
  addVote: function (req, res, next) {
    if (req.body.runnable == null && !req.image) {
      res.json(400, { message: 'must include runnable to vote on' });
    } else {
      req.self.addVote(req.domain,
        req.image && req.image._id || utils.decodeId(req.body.runnable),
        req.domain.intercept(function (vote) {
          req.vote = vote;
          res.status = 201;
          next();
        }));
    }
  },
  returnVote: function (req, res) {
    res.json(res.status || 200, req.vote);
  },
  removeVote: function (req, res, next) {
    req.self.removeVote(req.domain, req.params.voteid, req.domain.intercept(function () {
      next();
    }));
  }
};