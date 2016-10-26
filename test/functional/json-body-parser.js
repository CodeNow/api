'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const before = lab.before
const beforeEach = lab.beforeEach
const after = lab.after
const afterEach = lab.afterEach
const Code = require('code')
const expect = Code.expect

const request = require('request')
const api = require('./fixtures/api-control')
const normalJsonPaylod = require('./fixtures/json-515kb')
const bigJsonPaylod = require('./fixtures/json-645kb')
const url = require('url')
const noop = require('101/noop')
const generateKey = require('./fixtures/key-factory')
const error = require('error')

describe('JSON body parser', function () {
  const ctx = {}
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(require('./fixtures/mocks/api-client').setup)
  after(require('./fixtures/mocks/api-client').clean)
  beforeEach(generateKey)
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  it('should be able to parse json less than ' + process.env.BODY_PARSER_SIZE_LIMIT, function (done) {
    const uri = url.format({
      protocol: 'http:',
      slashes: true,
      host: process.env.ROOT_DOMAIN,
      pathname: '/auth/whitelist'
    })
    const headers = {
      host: process.env.ROOT_DOMAIN,
      accept: '*/*',
      'user-agent': 'runnable client',
      'content-type': 'application/json'
    }
    request.post({url: uri, headers: headers, json: normalJsonPaylod}, function (err, res) {
      if (err) { return done(err) }
      expect(res.statusCode).to.equal(401)
      done()
    })
  })
  describe('error', function () {
    beforeEach(function (done) {
      // noop error log to prevent spam
      ctx.errorLog = error.log
      error.log = noop
      done()
    })
    afterEach(function (done) {
      // restore error log
      if (ctx.errorLog) {
        error.log = ctx.errorLog
      }
      done()
    })
    it('should fail to parse json more than ' + process.env.BODY_PARSER_SIZE_LIMIT, function (done) {
      const uri = url.format({
        protocol: 'http:',
        slashes: true,
        host: process.env.ROOT_DOMAIN,
        pathname: '/auth/whitelist'
      })
      const headers = {
        host: process.env.ROOT_DOMAIN,
        accept: '*/*',
        'user-agent': 'runnable client',
        'content-type': 'application/json'
      }
      request.post({url: uri, headers: headers, json: bigJsonPaylod}, function (err, res, body) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(500)
        expect(body.message).to.equal('An internal server error occurred')
        done()
      })
    })
  })
})
