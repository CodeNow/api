const aws = require('aws-sdk')
const logger = require('logger')
const s3 = new aws.S3()
const Promise = require('bluebird')

const pipeLogsToClient = (targetStream, containerId) => {
  const log = logger.child({
    container: containerId,
    method: 'pipeLogsToClient'
  })
  log.trace('called')

  const s3Object = s3.getObject({
    Bucket: `${process.env.NODE_ENV}.container-logs`,
    Key: containerId
  })

  return Promise.fromCallback((cb) => {
    s3Object
      .createReadStream()
      .on('data', (data) => {
        targetStream.write(data.toString())
      })
      .on('error', (error) => {
        log.trace({error}, 'Error while fetching logs from s3')
        cb(error)
      })
      .on('end', () => {
        log.trace('Finished serving logs from s3')
        targetStream.end()
        cb(null)
      })
  })
}

module.exports = {
  pipeLogsToClient: pipeLogsToClient
}
