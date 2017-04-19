'use strict'
/**
 * This script updates all instances to save their shortName to the database.
 */
require('loadenv')()
const ClusterDataService = require('models/services/cluster-data-service')
const Instances = require('models/mongo/instance')
const keypather = require('keypather')()
const mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)
const Promise = require('bluebird')

const dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

function updateShortName(i, shortName) {
  if (!i || !shortName) {
    console.log('Nothing to update, data not found', i)
    return
  }
  const clusterName = keypather.get(i, '_doc.inputClusterConfig.clusterName')
  if (dryRun) {
    console.log('Skipped instance ' + i.name, shortName, i.masterPod, !!clusterName, !!i.isolated, i.isIsolationGroupMaster)
    return
  }
  const id = i._id.toString()
  return Instances.findByIdAndUpdateAsync(id, {
    $set: {
      shortName
    }
  })
}

Instances.findAsync({})
  .each(ClusterDataService.populateInstanceWithClusterInfo.bind(ClusterDataService))
  .map((i) => {
    console.log('Processing instance: ' + i.name)
    // if instance has inputClusterConfig then remove cluster name from name and save as shortName
    // else
    //  if instance is masterPod then shortName equals name
    //  else shortName equals name of the parent
    const clusterName = keypather.get(i, '_doc.inputClusterConfig.clusterName')
    if (clusterName) {
      let shortName = i.name.split(clusterName + '-')[1]
      console.log('Calculate shortName', clusterName, i.name, shortName, i.masterPod)
      return {
        instance: i,
        shortName
      }
    } else {
      if (i.masterPod && !i.isolated) {
        let shortName = i.name
        console.log('New shortName for master instance', i.name, i.masterPod, clusterName)
        return {
          instance: i,
          shortName
        }
      } else {
        // if isolated and not isolated master
        if (i.isolated && !i.isIsolationGroupMaster) {
          let shortName = i.name.split('--')[1]
          console.log('New shortName isolated child', i.name, shortName, i.masterPod, clusterName)
          return {
            instance: i,
            shortName
          }
        }
        console.log('Find parent name', i.name, i.parent, i.masterPod, clusterName)
        return Instances.findOneByShortHashAsync(i.parent)
          .then((parent) => {
            if (!parent) {
              console.log('cannot find parent:', instance)
              return {
                instance: i
              }
            }
            const shortName = parent.name
            console.log('New shortName for the simple fork', i.name, shortName, i.masterPod, clusterName)
            return {
              instance: i,
              shortName
            }
          })
      }
    }
  })
  .each((data) => {
    const instance = data.instance
    const shortName = data.shortName
    return updateShortName(instance, shortName)
  })
  .then(() => {
    console.log('done.')
    process.exit(0)
  })
  .catch(function (err) {
    console.error('error happened', err)
    return process.exit(1)
  })
