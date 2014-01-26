var _ = require('lodash');
var utils = require('middleware/utils');
module.exports = {
  getVotes: function (req, res) {
    res.json(req.self.getVotes());
  },
  meVoteOn: function (imageKey) {
    return function (req, res, next) {
      var image = req[imageKey];
      req.me.voteOn(image, req.domain.intercept(function (user) {
        var vote = _.findWhere(users.votes, function (vote) {
          return utils.equalObjectIds(vote.runnable, image._id);
        });
        this.vote = vote;
        next();
      }));
    };
  },
  respond: utils.respond.bind(utils, 'vote'),
  removeVote: function (req, res, next) {
    req.self.removeVote(req.domain, req.params.voteid, req.domain.intercept(function () {
      next();
    }));
  }
};