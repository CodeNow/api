'use strict'
/**
 * This script updates all instances to save their shortName to the database.
 */
require('loadenv')()
const ClusterDataService = require('models/services/cluster-data-service')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const keypather = require('keypather')()
const mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)
const Promise = require('bluebird')

const dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

InputClusterConfig.findAsync({})
  .map((cluster) => {
    const clusterAttrs = cluster.toJSON()
    console.log('Processing cluster: ' + cluster.clusterName)
    if (clusterAttrs.filePath) {
      if (dryRun) {
        console.log('Skipped cluster update: ' + cluster.clusterName)
        return
      }
      console.log('Updating cluster: ' + cluster.clusterName)
      cluster.set({
        $push: {
          files: {
            path: cluster.filePath,
            sha: cluster.fileSha
          }
        }
      })
      return cluster.saveAsync()
    }
    console.log('Skipped cluster: ' + cluster.clusterName)
    return
  })
  .then(() => {
    console.log('done.')
    process.exit(0)
  })
  .catch(function (err) {
    console.error('error happened', err)
    return process.exit(1)
  })
