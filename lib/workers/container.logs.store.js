/**
 * Handle instance container log store events
 * @module lib/workers/container.log.store
 */
'use strict'

require('loadenv')()

const joi = require('utils/joi')
const logger = require('logger')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const commonStream = require('socket/common-stream')
const Through2 = require('through2')
const aws = require('aws-sdk')
const Docker = require('models/apis/docker')

const s3 = new aws.S3()

module.exports.jobSchema = joi.object({
  containerId: joi.string().required()
}).unknown().required()

module.exports.task = (job) => {
  const log = logger.child({
    container: job.containerId,
    method: 'ContainerLogsStore'
  })
  log.trace('called')
  const docker = new Docker({ timeout: 0 })
  return docker.getLogsAsync(job.containerId)
    .then(function (dockerLogStream) {
      log.trace({
        bucket: `${process.env.NODE_ENV}.container-logs`,
        key: job.containerId
      }, 'Began piping logs')
      const cleanedStream = new Through2({}, commonStream.buff2StringTransform)
      commonStream.connectStream(dockerLogStream, cleanedStream, log)

      dockerLogStream.on('end', () => {
        log.trace('Dockerlog stream ended')
        cleanedStream.end()
      })
      // Send stream to s3
      return s3.upload({
        Bucket: `${process.env.NODE_ENV}.container-logs`,
        Key: job.containerId,
        Body: cleanedStream
      })
        .promise()
        .catch((err) => {
          log.error({err}, 'Error uploading logs to s3')
          throw new WorkerStopError('Error uploading logs to s3', {originalError: err})
        })
    })
    .then((uploadData) => {
      log.trace({
        uploadData
      }, 'Upload completed successfully')
      return uploadData
    })
}
