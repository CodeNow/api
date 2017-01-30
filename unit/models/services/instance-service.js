'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach
const sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))
const expect = require('code').expect

const assign = require('101/assign')
const Boom = require('dat-middleware').Boom
const exists = require('101/exists')
const keypather = require('keypather')()
const pick = require('101/pick')
const Promise = require('bluebird')
const put = require('101/put')

const Build = require('models/mongo/build')
const BuildService = require('models/services/build-service')
const ContextVersion = require('models/mongo/context-version')
const ContextVersionService = require('models/services/context-version-service')
const Docker = require('models/apis/docker')
const error = require('error')
const formatObjectForMongo = require('utils/format-object-for-mongo')
const Instance = require('models/mongo/instance')
const InstanceCounter = require('models/mongo/instance-counter')
const joi = require('utils/joi')
const logger = require('logger')
const messenger = require('socket/messenger')
const PermissionService = require('models/services/permission-service')
const rabbitMQ = require('models/rabbitmq')
const User = require('models/mongo/user')
const mockSessionUser = { accounts: { github: { id: 4 } } }

const InstanceService = require('models/services/instance-service')

describe('Instances Services Model', function () {
  beforeEach((done) => {
    sinon.stub(Instance, 'findAsync').resolves({})
    sinon.stub(Instance, 'populateModelsAsync').resolves()
    done()
  })

  afterEach((done) => {
    Instance.findAsync.restore()
    Instance.populateModelsAsync.restore()
    done()
  })

  describe('#filter for instances by branch name', () => {
    it('should use the instance model to find documents', (done) => {
      const branchName = 'hello-henry-branch-name'
      InstanceService.findInstanceByBranchName(branchName, mockSessionUser)
        .asCallback((err) => {
          expect(err).to.not.exist()
          sinon.assert.calledWithExactly(Instance.findAsync, {name: branchName})
          done()
      })
    })
  })
})
