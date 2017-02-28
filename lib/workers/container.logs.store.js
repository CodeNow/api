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

      const cleanedStream = new through2({objectMode:true})

      cleanedStream.on('error', (err) => {
        log.error({err}, 'Stream error')
      })
      cleanedStream.on('end', () => {
        log.trace('Cleaned stream ended')
      })
      cleanedStream.on('data', (data) => {
        log.trace({data: data.toString()}, 'Got actual stream data')
      })

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
