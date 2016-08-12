'use strict'
var nock = require('nock')

module.exports.whitelistUserOrgs = function (user, orgs) {
  var userId = user.attrs.accounts.github.id
  nock('http://' + process.env.BIG_POPPA_HOST)
    .get('/user/?githubId=' + userId)
    .times(1000)
    .reply(
      200,
      [{
        organizations: orgs,
        githubId: userId
      }]
    )
}
module.exports.whitelistOrgs = function (orgs) {
  var whitelistNock = nock('http://' + process.env.BIG_POPPA_HOST)
  orgs.forEach(function (org) {
    whitelistNock
      .get('/organization/?lowerName=' + org.name.toLowerCase())
      .times(1000)
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
      .times(1000)
      .reply(
        200,
        [{
          name: org.name,
          githubId: org.githubId,
          allowed: true
        }]
      )
    whitelistNock
      .post('/organization/:orgId/add')
      .times(1000)
      .filteringPath(/organization\/[0-9A-z]*\/add/, '')
      .reply(
        404, {
          err: 'NO!'
        }
      )
  })
}
