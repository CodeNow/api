const aws = require('aws-sdk')
const logger = require('logger')
const s3 = new aws.S3()

const pipeLogsToClient = (targetStream, containerId) => {
  const log = logger.child({
    container: containerId,
    method: 'pipeLogsToClient'
  })
  log.trace('called')
  return s3.getObject({
    Bucket: `${process.env.NODE_ENV}.container-logs`,
    Key: containerId
  })
    .promise()
    .then((logFile) => {
      log.trace({logFile}, 'Retrieved log from s3')
      logFile.Body.on('data', (data) => {
        targetStream.push(data)
      })
      logFile.Body.on('end', () => {
        log.trace('Finished serving logs from s3')
        targetStream.end()
      })
    })
}

module.exports = {
  pipeLogsToClient: pipeLogsToClient
}
