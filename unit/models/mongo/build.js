'use strict'
const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')

const Build = require('models/mongo/build')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Build model unit test', () => {
  let testBuild
  const testBuildId = '123123123'

  beforeEach((done) => {
    testBuild = {
      _id: testBuildId,
      contexts: ['1111'],
      contextVersions: ['2222'],
      createdBy: {
        github: '3333'
      },
      owner: {
        github: '4444'
      }
    }
    done()
  })

  describe('findBuildById', () => {
    beforeEach((done) => {
      sinon.stub(Build, 'findBuild')
      done()
    })

    afterEach((done) => {
      Build.findBuild.restore()
      done()
    })

    it('should pass correct query', (done) => {
      Build.findBuild.resolves(testBuild)
      Build.findBuildById(testBuildId).asCallback((err, build) => {
        if (err) { return done(err) }
        expect(build).to.equal(testBuild)
        sinon.assert.calledOnce(Build.findBuild)
        sinon.assert.calledWith(Build.findBuild, {
          _id: testBuildId
        })
        done()
      })
    })
  }) // end findBuildById

  describe('findBuild', () => {
    beforeEach((done) => {
      sinon.stub(Build, 'findOneAsync')
      done()
    })

    afterEach((done) => {
      Build.findOneAsync.restore()
      done()
    })

    it('should return build for query', (done) => {
      const testQuery = {
        _id: testBuildId
      }
      Build.findOneAsync.resolves(testBuild)

      Build.findBuild(testQuery).asCallback((err, build) => {
        if (err) { return done(err) }
        expect(build).to.equal(testBuild)
        sinon.assert.calledOnce(Build.findOneAsync)
        sinon.assert.calledWith(Build.findOneAsync, testQuery)
        done()
      })
    })

    it('should return Build.NotFoundError if not found', (done) => {
      Build.findOneAsync.resolves()

      Build.findBuild({}).asCallback((err) => {
        expect(err).to.be.instanceof(Build.NotFoundError)
        done()
      })
    })
  }) // end findBuild
})
