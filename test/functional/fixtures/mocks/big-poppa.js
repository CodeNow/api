'use strict'
var nock = require('nock')

module.exports.whitelistUserOrgs = function (user, orgs) {
  const bigPoppaNock = nock('http://' + process.env.BIG_POPPA_HOST)
  var userId = user.attrs.accounts.github.id
  bigPoppaNock
    .get('/user')
    .query(true)
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
  const bigPoppaNock = nock('http://' + process.env.BIG_POPPA_HOST)
  orgs.forEach(function (org) {
    bigPoppaNock
      .get('/organization/?lowerName=' + org.name.toLowerCase())
      .times(1000)
      .reply(
        200,
        [{
          name: org.name,
          lowerName: org.name.toLowerCase(),
          githubId: org.githubId,
          allowed: true
        }]
      )
    bigPoppaNock
      .get('/organization/?githubId=' + org.githubId)
      .times(1000)
      .reply(
        200,
        [{
          name: org.name,
          lowerName: org.name.toLowerCase(),
          githubId: org.githubId,
          allowed: true
        }]
      )
    bigPoppaNock
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
module.exports.sessionUser = function (orgs) {
  const bigPoppaNock = nock('http://' + process.env.BIG_POPPA_HOST)
  bigPoppaNock
    .filteringPath(function (path) {
      if (path.match(/.*user.*github/i)) {
        return '/user'
      }
    })
    .get('/user')
    .times(1000)
    .reply(
      200,
      [{
        id: 1,
        githubId: 198198,
        isActive: true,
        organizations: [{
          name: 'super-org',
          githubId: 123123,
          allowed: true
        }]
      }]
    )
}
