'use strict'
require('loadenv')()
const joi = require('utils/joi')

const logger = require('logger')

class Worker {
  constructor (job) {
    this.log = logger.child({
      job: this.job,
      method: 'CluserSiblingCreate'
    })
  }

  run () {
    this.log.info('stub')
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
