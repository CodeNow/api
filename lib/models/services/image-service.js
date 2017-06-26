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
  if (keypather.get(ports, 'length')) {
    return ports.reduce((acc, portObj) => {
      let keys = Object.keys(portObj)
      let splitPort = keys[0].split('/')

      if (splitPort.length === 2) {
        acc.push({
          protocol: splitPort[1],
          port: splitPort[0]
        })
      }

      return acc
    }, [])
  }

  return []
}

ImageService.getImageDataFromJob = function (job) {
  const log = ImageService.logger.child({
    method: 'getImageDataFromJob'
  })

  log.info('called')

  let rawImageData = keypather.get(job, 'inspectImageData.Config')
  let imageData = {}

  if (!rawImageData) {
    return {
      ports: [],
      cmd: [],
      entryPoint: []
    }
  } else {
    imageData.port = ImageService.parsePorts(
      keypather.get(rawImageData, 'ExposedPorts'))
    imageData.cmd = keypather.get(rawImageData, 'Cmd') || []
    imageData.entryPoint = keypather.get(rawImageData, 'Entrypoint') || []

    log.info('rawImageData')
    log.info(rawImageData)
    log.info('the returned image data')
    log.info(imageData)

    return imageData
  }
}
