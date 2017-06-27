'use strict'
const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')

const ClusterBuild = require('../../../lib/models/mongo/cluster-build')
const mongooseControl = require('../../../lib/models/mongo/mongoose-control')
const Worker = require('../../../lib/workers/cluster-build.complete')

const lab = exports.lab = Lab.script()
require('sinon-as-promised')

const after = lab.after
const afterEach = lab.afterEach
const before = lab.before
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it


var rabbitMQ = require('models/rabbitmq')
var mockFactory = require('../fixtures/factory')


describe('cluster-build.complete Integration Tests', function () {
  before(mongooseControl.start)
  beforeEach(require('../../functional/fixtures/clean-mongo').removeEverything)

  afterEach((done) => {
    ClusterBuild.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('task', () => {
    let testJob
    let savedClusterBuild
    let savedInstances

    const testOwner = {
      accounts: {
        github: {
          id: 111111,
          username: 'owner'
        }
      }
    }

    const testSpecifications = [{
      envs: [{
        name: 'HOST_NAME',
        value: 'localhost'
      }, {
        name: 'TEST',
        value: 'ing'
      }],
      image: 'localhost/1111/2222/3',
      memorySoftLimit: '256',
      name: 'instance0',
      ports: [80, 53],
    }, {
      envs: [],
      image: 'localhost/444/5/6',
      memorySoftLimit: `${process.env.CONTAINER_SOFT_MEMORY_LIMIT_BYTES}`,
      name: 'instance1',
      ports: []
    }]

    beforeEach(() => {
      sinon.stub(rabbitMQ, 'publishClusterBuildBuilt')
      return Promise.props({
        instance0: Promise.fromCallback((cb) => {
          mockFactory.createInstanceWithProps(testOwner, {
            dockerTag: testSpecifications[0].image,
            env: ['HOST_NAME=localhost', 'TEST=ing'],
            name: testSpecifications[0].name,
            ports: [80, 53],
            userContainerMemoryInBytes: testSpecifications[0].memorySoftLimit
          }, cb)
        }),
        instance1: Promise.fromCallback((cb) => {
          mockFactory.createInstanceWithProps(testOwner, {
            dockerTag: testSpecifications[1].image,
            name: testSpecifications[1].name
          }, cb)
        })
      })
      .then((instances) => {
        savedInstances = instances

        return ClusterBuild.createAsync({
          state: 'building',
          instanceIds: [savedInstances.instance0._id, savedInstances.instance1._id]
        })
        .then((saved) => {
          savedClusterBuild = saved
        })
      })
    })

    afterEach((done) => {
      rabbitMQ.publishClusterBuildBuilt.restore()
      done()
    })

    it('should publish cluster build built', () => {
      return Worker.task({
        clusterBuildId: savedClusterBuild._id
      })
      .then(() => {
        sinon.assert.calledOnce(rabbitMQ.publishClusterBuildBuilt)
        console.log(JSON.stringify(testSpecifications), 'expect')
        testSpecifications[0]._id = savedInstances.instance0._id
        testSpecifications[1]._id = savedInstances.instance1._id
        sinon.assert.calledWith(rabbitMQ.publishClusterBuildBuilt, sinon.match({
          clusterBuild: {
            specifications: sinon.match([
              sinon.match({
                name: testSpecifications[0].name,
                image: testSpecifications[0].image,
                ports: testSpecifications[0].ports,
                memorySoftLimit: testSpecifications[0].memorySoftLimit,
                envs: testSpecifications[0].envs
              }),
              sinon.match({
                name: testSpecifications[1].name,
                image: testSpecifications[1].image,
                ports: testSpecifications[1].ports,
                memorySoftLimit: testSpecifications[1].memorySoftLimit,
                envs: testSpecifications[1].envs
              })
            ])
          }
        }))
      })
    })
  })
})
