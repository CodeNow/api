'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var validation = require('../../fixtures/validation')(lab)
var mongooseControl = require('models/mongo/mongoose-control.js')

var InfracodeVersion = require('models/mongo/infra-code-version')
var Boom = require('dat-middleware').Boom
var sinon = require('sinon')

describe('InfraCodeVersion Model Integration Tests', function () {
  before(mongooseControl.start)
  afterEach(function (done) {
    InfracodeVersion.remove({}, done)
  })

  after(function (done) {
    InfracodeVersion.remove({}, done)
  })
  after(mongooseControl.stop)

  function createNewInfracodeVersion () {
    return new InfracodeVersion({
      context: validation.VALID_OBJECT_ID,
      parent: validation.VALID_OBJECT_ID,
      created: Date.now(),
      files: [{
        Key: 'test',
        ETag: 'test',
        VersionId: validation.VALID_OBJECT_ID
      }]
    })
  }

  it('should be able to save an Infracode version!', function (done) {
    var infracode = createNewInfracodeVersion()
    infracode.save(function (err, infracode) {
      if (err) { return done(err) }
      if (err) { return done(err) }
      expect(infracode).to.exist()
      expect(infracode.files.length).to.equal(1)
      expect(infracode.files[0].created).to.be.a.date()
      done()
    })
  })

  it('should be create a copy, and keep the originals env as its parentEnv', function (done) {
    var infracode = createNewInfracodeVersion()
    infracode.save(function (err, infracode) {
      if (err) { return done(err) }
      InfracodeVersion.createCopyById(infracode._id, function (err, childInfracode) {
        if (err) { return done(err) }
        expect(childInfracode).to.exist()
        expect(childInfracode.parent.toString()).to.equal(infracode._id.toString())
        expect(childInfracode.files.length).to.equal(1)
        expect(childInfracode.files[0].created).to.be.a.date()
        done()
      })
    })
  })

  it('should be create a copy, but not save the parentEnv since it did not change', function (done) {
    var infracode = createNewInfracodeVersion()
    infracode.save(function (err, infracode) {
      if (err) { return done(err) }
      InfracodeVersion.createCopyById(infracode._id, function (err, childInfracode) {
        if (err) { return done(err) }
        expect(childInfracode).to.exist()
        expect(childInfracode.parent.toString()).to.equal(infracode._id.toString())
        expect(childInfracode.files.length).to.equal(1)
        expect(childInfracode.files[0].created).to.be.a.date()
        done()
      })
    })
  })

  it('should be create a copy, but not save the parentEnv since it did not change', function (done) {
    var infracode = createNewInfracodeVersion()
    infracode.save(function (err, infracode) {
      if (err) { return done(err) }
      InfracodeVersion.createCopyById(infracode._id, function (err, childInfracode) {
        if (err) { return done(err) }
        expect(childInfracode).to.exist()
        expect(childInfracode.parent.toString()).to.equal(infracode._id.toString())
        expect(childInfracode.files.length).to.equal(1)
        expect(childInfracode.files[0].created).to.be.a.date()
        done()
      })
    })
  })

  it('should be create a copy, but not have a parentEnv since the parent did not', function (done) {
    var infracode = createNewInfracodeVersion()
    infracode.save(function (err, infracode) {
      if (err) { return done(err) }
      InfracodeVersion.createCopyById(infracode._id, function (err, childInfracode) {
        if (err) { return done(err) }
        expect(childInfracode).to.exist()
        expect(childInfracode.parent.toString()).to.equal(infracode._id.toString())
        expect(childInfracode.files.length).to.equal(1)
        expect(childInfracode.files[0].created).to.be.a.date()
        done()
      })
    })
  })

  describe('upsertFs', function () {
    it('should call `update` when path exists', function (done) {
      var infracode = createNewInfracodeVersion()
      sinon.stub(infracode, 'findFs').yieldsAsync(null, { isDir: false })
      sinon.stub(infracode, 'updateFile').yieldsAsync()
      var filepath = '/translation_rules.sh'
      var body = 'file body'
      infracode.upsertFs(filepath, body, function (err) {
        if (err) { return done(err) }
        expect(infracode.findFs.calledWith(filepath)).to.be.true()
        expect(infracode.updateFile.calledWith(filepath, body)).to.be.true()
        infracode.findFs.restore()
        infracode.updateFile.restore()
        done()
      })
    })

    it('should call `createFs` path does not exist', function (done) {
      var infracode = createNewInfracodeVersion()
      sinon.stub(infracode, 'findFs').yieldsAsync()
      sinon.stub(infracode, 'createFs').yieldsAsync()
      var filepath = '/etc/translation_rules.sh'
      var body = 'file body'
      infracode.upsertFs(filepath, body, function (err) {
        if (err) { return done(err) }
        expect(infracode.findFs.calledWith(filepath)).to.be.true()
        expect(infracode.createFs.calledWith({
          name: 'translation_rules.sh',
          path: '/etc',
          body: body
        })).to.be.true()
        infracode.findFs.restore()
        infracode.createFs.restore()
        done()
      })
    })

    it('should boom when path is a directory', function (done) {
      var infracode = createNewInfracodeVersion()
      var boomObject = { boom: true }
      var filepath = '/dang/dat/is/a/sweet/earth.yml'
      var body = 'much body, such wow'
      sinon.stub(Boom, 'badRequest').returns(boomObject)
      sinon.stub(infracode, 'findFs').yieldsAsync(null, { isDir: true })
      infracode.upsertFs(filepath, body, function (err) {
        expect(err).to.equal(boomObject)
        infracode.findFs.restore()
        Boom.badRequest.restore()
        done()
      })
    })

    it('should yield error if findFs fails', function (done) {
      var infracode = createNewInfracodeVersion()
      var error = new Error('wow')
      var filepath = '/coolbeans.yml'
      var body = 'abcdef123'
      sinon.stub(infracode, 'findFs').yieldsAsync(error)
      infracode.upsertFs(filepath, body, function (err) {
        expect(err).to.equal(error)
        infracode.findFs.restore()
        done()
      })
    })
  })
})
