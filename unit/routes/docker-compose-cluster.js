/**
 * @module unit/routes/billing
 */
'use strict'
require('loadenv')()

// const Promise = require('bluebird')
const Lab = require('lab')
// const sinon = require('sinon')
// require('sinon-as-promised')(Promise)

const rabbitMQ = require('models/rabbitmq')
const post = require('routes/docker-compose-cluster').post
const delete = require('routes/docker-compose-cluster').delete

const lab = exports.lab = Lab.script()
const describe = lab.describe
const beforeEach = lab.beforeEach
const it = lab.it

describe('/docker-compose-cluster', function () {
  const resMock
  beforeEach(function (done) {
    resMock = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis()
    }
    done()
  })
  describe('post', function () {
    beforeEach(function (done) {
      done()
    })
    describe('Errors', function () {
      it('should throw a Boom error if the schema is not correct', function () {
      })
    })

    describe('Success', function () {
      it('should create the cluster', function () {
      })
    })
  })

  describe('delete', function () {
    describe('Errors', function () {
    })

    describe('Success', function () {
    })
  })
})
