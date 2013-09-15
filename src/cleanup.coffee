error = require './error'
users = require './models/users'
containers = require './models/containers'

module.exports = (req, res) ->
  users.findUser _id: req.user_id, (err, user) ->
    if err then done err else
      if not user then cb() else
        if not user.isModerator() then error 403, 'permission denied' else
