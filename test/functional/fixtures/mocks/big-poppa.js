'use strict'
var nock = require('nock')

module.exports.whitelistUserOrgs = function (user, orgs) {
  nock('http://' + process.env.BIG_POPPA_HOST)
    .get('/user/?githubId=' + user.attrs.accounts.github.id)
    .reply(200, [{
      organizations: orgs.map(function (org) {
        return {
          name: org.name,
          githubId: org.githubId,
          allowed: true
        }
      }),
      githubId: user.attrs.accounts.github.id
    }])
}
module.exports.whitelistOrgs = function (orgs) {
  var whitelistNock = nock('http://' + process.env.BIG_POPPA_HOST)
  orgs.forEach(function (org) {
    whitelistNock
      .get('/organization/?lowerName=' + org.name.toLowerCase())
      .reply(
        200,
        [{
          name: org.name,
          githubId: org.githubId,
          allowed: true
        }]
      )
    whitelistNock
      .get('/organization/?githubId=' + org.githubId)
      .reply(
        200,
        [{
          name: org.name,
          githubId: org.githubId,
          allowed: true
        }]
      )
  })
}
