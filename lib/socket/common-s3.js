const aws = require('aws-sdk')
const logger = require('logger')
const s3 = new aws.S3()

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

  s3Object
    .createReadStream()
    .pipe(targetStream)
    .on('end', () => {
      log.trace('Finished serving logs from s3')
    })

  return s3Object.promise()
    .then((logFile) => {
      log.trace({
        logFile: {
          ContentLength: logFile.ContentLength,
          LastModified: logFile.LastModified,
          Metadata: logFile.Metadata
        }
      }, 'Retrieved log from s3')
      return logFile
    })
}

module.exports = {
  pipeLogsToClient: pipeLogsToClient
}
