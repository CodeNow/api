'use strict'

var Code = require('code')
var ContextVersion = require('models/mongo/context-version')
var Lab = require('lab')
var ObjectId = require('mongoose').Types.ObjectId

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect
// var beforeEach = lab.beforeEach
// var afterEach = lab.afterEach

var flattenMongooseDoc = require('utils/flatten-mongoose-doc')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('flattenMongooseDoc: ' + moduleName, function () {
  it('should flatten a mongoose doc', function (done) {
    var cvId = new ObjectId()
    var buildId = new ObjectId()
    var contextId = new ObjectId()
    var contextVersion = new ContextVersion({
      _id: cvId,
      build: {
        _id: buildId
      },
      owner: {
        github: 'owner'
      },
      context: contextId,
      infraCodeVersion: {
        bucket: function () {
          return {
            bucket: 'bucket',
            sourcePath: 'sourcePath'
          }
        },
        files: []
      },
      appCodeVersions: [
        {
          repo: 'github.com/user/repo1',
          commit: 'commit',
          privateKey: 'private1'
        },
        {
          repo: 'github.com/user/repo2',
          branch: 'branch',
          privateKey: 'private2'
        },
        {
          repo: 'github.com/user/repo2',
          privateKey: 'private2'
        }
      ]
    })
    var flatCv = flattenMongooseDoc(contextVersion)
    expect(flatCv).to.deep.equal({
      'id': cvId.toString(),
      '_id': cvId.toString(),
      'context': contextId.toString(),
      'build._id': buildId.toString(),
      'owner.github': 'owner',
      'build.duration': undefined,
      'build.dockerContainerName': contextVersion.build.dockerContainerName.toString(),
      'advanced': false,
      'appCodeVersions[0]._id': contextVersion.appCodeVersions[0]._id.toString(),
      'appCodeVersions[0].repo': 'github.com/user/repo1',
      'appCodeVersions[0].lowerRepo': 'github.com/user/repo1',
      'appCodeVersions[0].commit': 'commit',
      'appCodeVersions[0].privateKey': 'private1',
      'appCodeVersions[0].useLatest': false,
      'appCodeVersions[1]._id': contextVersion.appCodeVersions[1]._id.toString(),
      'appCodeVersions[1].repo': 'github.com/user/repo2',
      'appCodeVersions[1].lowerRepo': 'github.com/user/repo2',
      'appCodeVersions[1].branch': 'branch',
      'appCodeVersions[1].lowerBranch': 'branch',
      'appCodeVersions[1].privateKey': 'private2',
      'appCodeVersions[1].useLatest': false,
      'appCodeVersions[2]._id': contextVersion.appCodeVersions[2]._id.toString(),
      'appCodeVersions[2].repo': 'github.com/user/repo2',
      'appCodeVersions[2].lowerRepo': 'github.com/user/repo2',
      'appCodeVersions[2].privateKey': 'private2',
      'appCodeVersions[2].useLatest': false,
      dockRemoved: false,
      dockRemovedConfirmedByUser: false
    })
    done()
  })

  it('should flatten a json mongoose doc', function (done) {
    var cvId = new ObjectId()
    var buildId = new ObjectId()
    var contextId = new ObjectId()
    var contextVersion = new ContextVersion({
      _id: cvId,
      build: {
        _id: buildId
      },
      owner: {
        github: 'owner'
      },
      context: contextId,
      infraCodeVersion: {
        bucket: function () {
          return {
            bucket: 'bucket',
            sourcePath: 'sourcePath'
          }
        },
        files: []
      },
      appCodeVersions: [
        {
          repo: 'github.com/user/repo1',
          commit: 'commit',
          privateKey: 'private1'
        },
        {
          repo: 'github.com/user/repo2',
          branch: 'branch',
          privateKey: 'private2'
        },
        {
          repo: 'github.com/user/repo2',
          privateKey: 'private2'
        }
      ]
    })
    var flatCv = flattenMongooseDoc(contextVersion.toJSON())
    expect(flatCv).to.deep.equal({
      'id': cvId.toString(),
      '_id': cvId.toString(),
      'context': contextId.toString(),
      'build._id': buildId.toString(),
      'owner.github': 'owner',
      'build.duration': undefined,
      'build.dockerContainerName': contextVersion.build.dockerContainerName.toString(),
      'advanced': false,
      'appCodeVersions[0]._id': contextVersion.appCodeVersions[0]._id.toString(),
      'appCodeVersions[0].repo': 'github.com/user/repo1',
      'appCodeVersions[0].lowerRepo': 'github.com/user/repo1',
      'appCodeVersions[0].commit': 'commit',
      'appCodeVersions[0].privateKey': 'private1',
      'appCodeVersions[0].useLatest': false,
      'appCodeVersions[1]._id': contextVersion.appCodeVersions[1]._id.toString(),
      'appCodeVersions[1].repo': 'github.com/user/repo2',
      'appCodeVersions[1].lowerRepo': 'github.com/user/repo2',
      'appCodeVersions[1].branch': 'branch',
      'appCodeVersions[1].lowerBranch': 'branch',
      'appCodeVersions[1].privateKey': 'private2',
      'appCodeVersions[1].useLatest': false,
      'appCodeVersions[2]._id': contextVersion.appCodeVersions[2]._id.toString(),
      'appCodeVersions[2].repo': 'github.com/user/repo2',
      'appCodeVersions[2].lowerRepo': 'github.com/user/repo2',
      'appCodeVersions[2].privateKey': 'private2',
      'appCodeVersions[2].useLatest': false,
      dockRemoved: false,
      dockRemovedConfirmedByUser: false
    })
    done()
  })

  it('should flatten a mongoose doc to an initial keypath', function (done) {
    var cvId = new ObjectId()
    var buildId = new ObjectId()
    var contextId = new ObjectId()
    var contextVersion = new ContextVersion({
      _id: cvId,
      build: {
        _id: buildId
      },
      owner: {
        github: 'owner'
      },
      context: contextId,
      infraCodeVersion: {
        bucket: function () {
          return {
            bucket: 'bucket',
            sourcePath: 'sourcePath'
          }
        },
        files: []
      },
      appCodeVersions: [
        {
          repo: 'github.com/user/repo1',
          commit: 'commit',
          privateKey: 'private1'
        },
        {
          repo: 'github.com/user/repo2',
          branch: 'branch',
          privateKey: 'private2'
        },
        {
          repo: 'github.com/user/repo2',
          privateKey: 'private2'
        }
      ]
    })
    var flatCv = flattenMongooseDoc(contextVersion.toJSON(), 'initKeypath')
    expect(flatCv).to.deep.equal({
      'initKeypath.id': cvId.toString(),
      'initKeypath._id': cvId.toString(),
      'initKeypath.context': contextId.toString(),
      'initKeypath.build._id': buildId.toString(),
      'initKeypath.owner.github': 'owner',
      'initKeypath.build.duration': undefined,
      'initKeypath.build.dockerContainerName': contextVersion.build.dockerContainerName.toString(),
      'initKeypath.advanced': false,
      'initKeypath.appCodeVersions[0]._id': contextVersion.appCodeVersions[0]._id.toString(),
      'initKeypath.appCodeVersions[0].repo': 'github.com/user/repo1',
      'initKeypath.appCodeVersions[0].lowerRepo': 'github.com/user/repo1',
      'initKeypath.appCodeVersions[0].commit': 'commit',
      'initKeypath.appCodeVersions[0].privateKey': 'private1',
      'initKeypath.appCodeVersions[0].useLatest': false,
      'initKeypath.appCodeVersions[1]._id': contextVersion.appCodeVersions[1]._id.toString(),
      'initKeypath.appCodeVersions[1].repo': 'github.com/user/repo2',
      'initKeypath.appCodeVersions[1].lowerRepo': 'github.com/user/repo2',
      'initKeypath.appCodeVersions[1].branch': 'branch',
      'initKeypath.appCodeVersions[1].lowerBranch': 'branch',
      'initKeypath.appCodeVersions[1].privateKey': 'private2',
      'initKeypath.appCodeVersions[1].useLatest': false,
      'initKeypath.appCodeVersions[2]._id': contextVersion.appCodeVersions[2]._id.toString(),
      'initKeypath.appCodeVersions[2].repo': 'github.com/user/repo2',
      'initKeypath.appCodeVersions[2].lowerRepo': 'github.com/user/repo2',
      'initKeypath.appCodeVersions[2].privateKey': 'private2',
      'initKeypath.appCodeVersions[2].useLatest': false,
      'initKeypath.dockRemoved': false,
      'initKeypath.dockRemovedConfirmedByUser': false
    })
    done()
  })

  it('should flatten a mongoose doc for certain keys', function (done) {
    var cvId = new ObjectId()
    var buildId = new ObjectId()
    var contextId = new ObjectId()
    var contextVersion = new ContextVersion({
      _id: cvId,
      build: {
        _id: buildId
      },
      owner: {
        github: 'owner'
      },
      context: contextId,
      infraCodeVersion: {
        bucket: function () {
          return {
            bucket: 'bucket',
            sourcePath: 'sourcePath'
          }
        },
        files: []
      }
    })
    var flatCv = flattenMongooseDoc(contextVersion.toJSON(), ['_id', 'owner'])
    expect(flatCv).to.deep.equal({
      '_id': cvId.toString(),
      'owner.github': 'owner'
    })
    done()
  })

  it('should flatten a mongoose doc to initial keypath for certain keys', function (done) {
    var cvId = new ObjectId()
    var buildId = new ObjectId()
    var contextId = new ObjectId()
    var contextVersion = new ContextVersion({
      _id: cvId,
      build: {
        _id: buildId
      },
      owner: {
        github: 'owner'
      },
      context: contextId,
      infraCodeVersion: {
        bucket: function () {
          return {
            bucket: 'bucket',
            sourcePath: 'sourcePath'
          }
        },
        files: []
      }
    })
    var flatCv = flattenMongooseDoc(contextVersion.toJSON(), 'foo', ['_id', 'owner'])
    expect(flatCv).to.deep.equal({
      'foo._id': cvId.toString(),
      'foo.owner.github': 'owner'
    })
    done()
  })
})
