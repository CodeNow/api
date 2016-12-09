'use strict'
require('loadenv')()
const joi = require('utils/joi')

const logger = require('logger')

class Worker {
  constructor (job) {
    this.log = logger.child({
      job: this.job,
      method: 'ApplicationContainerCreatedWorker'
    })
  }

  run () {
    this.log.info('TODO')
  }
}

module.exports = {
  _Worker: Worker,
  task: (job) => {
    const worker = new Worker(job)
    return worker.run()
  },
  jobSchema: joi.object({}).unknown().required()
}
