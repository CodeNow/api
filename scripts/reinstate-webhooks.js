/*
 * This script should be run whenever an org's webhooks are messed up.  This will create webhooks
 * for every repository currently connected to an instance in our database
 * `NODE_ENV=development NODE_PATH=./lib node scripts/reinstate-webhooks.js {{OrgName}}`
 *
 * NOTE: This script will use every user connected to an org to attempt creating the hook
 */

'use strict'

require('loadenv')()

const customError = require('custom-error')
const GitHub = require('models/apis/github')
const Instance = require('models/mongo/instance')
const mongoose = require('mongoose')
const OrgService = require('models/services/organization-service')
const Promise = require('bluebird')

var args = process.argv.slice(2)
if (!args.length) {
  console.log('Missing Org name')
  throw new Error('You must give an organization name as an input')
}
/*
 * START SCRIPT
 */
const WebhookSuccessful = customError('WebHook Successful')
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
        .mapSeries(function (instance) {
          return OrgService.getUsersByOrgName(orgName)
            // This mapSeries will do 1 at a time until it successfully adds the hook.  That causes
            // the WebhookSuccessful error, which fires the WebhookSuccessful catch and ends that loop.
            // This short circuits this mapSeries, moving us to the next instance
            .mapSeries(user => {
              const token = user.accounts.github.accessToken
              const github = new GitHub({token})
              return github.createRepoHookIfNotAlreadyAsync(instance.getRepoName())
                .catch(function (err) {
                  console.error('user', user.accounts.github.username, 'couldn\'t add the hook for', instance.getRepoName(), err)
                  return -1
                })
                .then(hookExists => {
                  if (hookExists === -1) {
                    return
                  }
                  if (hookExists) {
                    console.log(instance.getRepoName(), 'already exists')
                  } else {
                    console.log('user', user.accounts.github.username, 'created a hook for', instance.getRepoName())
                  }
                  throw new WebhookSuccessful('Hey')
                })
            })
            .catch(WebhookSuccessful, () => {
              console.log('HEY')
              // successful add, so next instance!
            })
        })
    })
    .finally(() => {
      return Promise.fromCallback(cb => {
        mongoose.disconnect(cb)
      })
    })
}
