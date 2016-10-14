'use strict'
// var nock = require('nock')
var MockAPI = require('mehpi')
const Promise = require('bluebird')
const port = process.env.BIG_POPPA_HOST.split(':')[1]
const bigPoppaAPI = new MockAPI(port)

const serverStart = Promise.fromCallback(function (cb) {
  bigPoppaAPI.start(cb)
})

module.exports.whitelistUserOrgs = function (user, orgs) {
  var userId = user.attrs.accounts.github.id
  return serverStart.then(function () {
    bigPoppaAPI.stub('GET', /user.*/i).returns({
      status: 200,
      body: [{
        organizations: orgs,
        githubId: userId
      }]
    })
  })
}
module.exports.whitelistOrgs = function (orgs) {
  return serverStart.then(function () {
    orgs.forEach(function (org) {
      bigPoppaAPI.stub('GET', '/organization/?lowerName=' + org.name.toLowerCase()).returns({
        status: 200,
        body: [{
          name: org.name,
          lowerName: org.name.toLowerCase(),
          githubId: org.githubId,
          allowed: true
        }]
      })
      bigPoppaAPI.stub('GET', '/organization/?githubId=' + org.name.toLowerCase()).returns({
        status: 200,
        body: [{
          name: org.name,
          lowerName: org.name.toLowerCase(),
          githubId: org.githubId,
          allowed: true
        }]
      })
      bigPoppaAPI.stub('POST', /organization\/[0-9A-z]*\/add/i).returns({
        status: 404,
        body: {
          err: 'NO!'
        }
      })
    })
  })
}
module.exports.sessionUser = function (orgs) {
  if (!orgs) {
    orgs = [{
      name: 'super-org',
      githubId: 123123,
      allowed: true
    }]
  }
  const userObj = {
    id: 1,
    githubId: 198198,
    isActive: true,
    organizations: orgs
  }
  return serverStart.then(function () {
    bigPoppaAPI.stub('GET', /user/, 50).returns({
      status: 200,
      body: [userObj]
    })
    bigPoppaAPI.stub('POST', /user/).returns({
      status: 201,
      body: userObj
    })
  })
}
