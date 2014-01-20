var utils = require('../middleware/utils');
var votes = module.exports = {
  getVotes: function (req, res) {
    res.json(req.user.getVotes());
  },
  addVote: function (req, res, next) {
    if (req.body.runnable == null) {
      res.json(400, { message: 'must include runnable to vote on' });
    } else {
      req.user.addVote(req.domain, utils.decodeId(req.body.runnable), req.domain.intercept(function (vote) {
        req.vote = vote;
        res.status = 201;
        next();
      }));
    }
  },
  returnVote: function (req, res, next) {
    res.json(res.status || 200, req.vote);
  },
  removeVote: function (req, res, next) {
    req.user.removeVote(req.domain, req.params.voteid, req.domain.intercept(function () {
      next();
    }));
  }
};