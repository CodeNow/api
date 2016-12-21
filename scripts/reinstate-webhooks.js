/*
 * This script should be run whenever the database needs to be repopulated with
 * the seed contexts
 * `NODE_ENV=development NODE_PATH=./lib node scripts/reinstate-webhooks.js {{OrgName}}`
 *
 * NOTE: This script will attempt to delete any existing source contexts, as well as their
 * instances.  It should output what it's deleting, so be sure to verify nothing else was targeted
 *
 * NOTE 2: Must log in as HelloRunnable and populate user model in mongo before running this script
 */

'use strict'

require('loadenv')()

const OrgService = require('models/services/organization-service')
const Instance = require('models/mongo/instance')
const mongoose = require('mongoose')
const Promise = require('bluebird')
const GitHub = require('models/apis/github')

var args = process.argv.slice(2)
if (!args.length) {
  console.log('Missing Org name')
  process.exit(1)
}
/*
 * START SCRIPT
 */
main(args[0])

function main (orgName) {
  return Promise.fromCallback(cb => {
    mongoose.connect(process.env.MONGO, cb)
  })
    .then(() => {
      return OrgService.getByGithubUsername(orgName)
    })
    .then((org) => {
      return Instance.findAsync({
        masterPod: true,
        'owner.github': org.githubId,
        'contextVersion.appCodeVersions': {
          $elemMatch: {
            $or: [
              {additionalRepo: false},
              {additionalRepo: {$exists: false}}
            ]
          }
        }
      }, {})
        .map(function (instance) {
          return OrgService.getUsersByOrgName(orgName)
            .map(user => {
              const token = user.accounts.github.accessToken
              const github = new GitHub({token})
              return github.createRepoHookIfNotAlreadyAsync(instance.getRepoName())
                .then(function () {
                  console.log('user', user.accounts.github.username, 'created a hook for', instance.getRepoName())
                })
                .catch(err => {
                  console.error('user', user.accounts.github.username, 'couldn\'t add the hook', err)
                })
            })
        })
    })
    .finally(() => {
      return Promise.fromCallback(cb => {
        mongoose.disconnect(cb)
      })
        .asCallback(err => {
          return process.exit(err ? 1 : 0)
        })
    })
}
