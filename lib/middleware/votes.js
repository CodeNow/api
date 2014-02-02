var _ = require('lodash');
var users = require('middleware/users');
var utils = require('middleware/utils');
var series = utils.series;
var error = require('error');
module.exports = {
  getVotes: function (req, res) {
    res.json(req.me.getVotes());
  },
  meVoteOn: function (imageKey) {
    return function (req, res, next) {
      var image = req[imageKey];
      req.me.voteOn(image, req.domain.intercept(function (user) {
        var vote = _.findWhere(req.me.votes, function (vote) {
          return utils.equalObjectIds(vote.runnable, image._id);
        });
        req.vote = vote;
        next();
      }));
    };
  },
  respond: function (req, res, next) {
    series(
      voteEncodeJSON,
      utils.respond(201, 'vote')
    )(req, res, next);
    function voteEncodeJSON (req, res, next) {
      var vote = req.vote;
      if (vote) {
        req.vote = vote.toJSON ? vote.toJSON() : vote;
        vote.runnable = utils.encodeId(vote.runnable);
      }
      next();
    }
  },
  removeVote: function (req, res, next) {
    req.me.removeVote(req.params.voteId, req.domain.intercept(function (success) {
      if (!success) {
        next(error(404, 'vote not found'));
      }
      next();
    }));
  }
};