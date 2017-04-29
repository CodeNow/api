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
    console.log('Processing cluster: ' + cluster.name)
    if (cluster.filePath) {
      if (dryRun) {
        console.log('Skipped cluster: ' + cluster.name)
        return
      }
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
