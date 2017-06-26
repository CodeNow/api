/**
 * @module lib/models/services/image-service
 */
'use strict'

require('loadenv')('models/services/infracode-version-service')

const keypather = require('keypather')()
const logger = require('logger')
const ImageService = module.exports = {}

ImageService.logger = logger.child({
  module: 'ImageService'
})

ImageService.parsePorts = function (ports) {
  let portList = []
  let splitPort

  if (ports) {
    for (let key of Object.keys(ports)) {
      splitPort = key.split('/')

      if (splitPort.length === 2) {
        portList.push({
          protocol: splitPort[1],
          port: splitPort[0]
        })
      }
    }
  }

  return portList
}

ImageService.getImageDataFromJob = function (job) {
  const log = ImageService.logger.child({
    method: 'getImageDataFromJob'
  })
  log.info('called')

  let rawImageData = keypather.get(job, 'inspectImageData.Config')
  if (rawImageData) {
    return {
      port: ImageService.parsePorts(keypather.get(rawImageData, 'ExposedPorts')),
      cmd: keypather.get(rawImageData, 'Cmd') || [],
      entryPoint: keypather.get(rawImageData, 'Entrypoint') || []
    }
  }

  return {
    ports: [],
    cmd: [],
    entryPoint: []
  }
}
