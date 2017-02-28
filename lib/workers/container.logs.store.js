/**
 * Handle instance container died event
 * @module lib/workers/application.container.died
 */
'use strict'

require('loadenv')()

const joi = require('utils/joi')
const logger = require('logger')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const commonStream = require('socket/common-stream')
const through2 = require('through2')
const aws = require('aws-sdk')

module.exports.jobSchema = joi.object({
  containerId: joi.string().required()
}).unknown().required()

module.exports.task = (job) => {
  const log = logger.child({
    container: job.containerId,
    method: 'ContainerLogsStore'
  })
  log.trace('called')

  // Create stream to send to s3
  const destStream = through2()

  // Begin piping logs stream
  commonStream.pipeLogsToClient(destStream, 'container-die-s3-save', {}, job.containerId)
  log.trace('Began piping logs')

  // Send stream to s3
  return s3.upload({
    Bucket: `${process.env.NODE_ENV}.container-logs`,
    Key: job.containerId,
    Body: destStream
  })
    .promise()
    .catch((err) => {
      log.error({err}, 'Error uploaidng logs to s3')
      throw new WorkerStopError('Error uploading logs to s3', {originalError: err})
    })
    .tap((uploadData) => {
      log.trace({
        uploadData
      }, 'Upload completed successfully')
    })
}
