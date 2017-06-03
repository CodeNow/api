/**
 * @module lib/models/mongo/schemas/input-cluster-config
 */
'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

const InputFileSchema = new Schema({
  path: {
    required: 'Input file requires file path',
    type: String
  },
  // The unique identifier given from the Repository for this file. We know the file has changed
  // if these are different
  sha: {
    required: 'Input file requires a sha',
    type: String
  }
})

const InputClusterConfigSchema = new Schema({
  clusterName: {
    required: 'Input Cluster Config requires a clusterName',
    type: String
  },
  files: {
    type: [ InputFileSchema ],
    'default': [],
    index: true
  },
  isTesting: {
    type: Boolean
  },
  repo: {
    // This is a Username/Repository where this file belongs
    required: 'Input Cluster Config requires a repo to which it belongs',
    type: String
  },
  lowerRepo: {
    // This is a Username/Repository where this file belongs
    required: 'Input Cluster Config requires a lowerRepo',
    type: String
  },
  branch: {
    // This is a Username/Repository where this file belongs
    required: 'Input Cluster Config requires a branch',
    type: String
  },
  lowerBranch: {
    // This is a Username/Repository where this file belongs
    required: 'Input Cluster Config requires a lowerBranch',
    type: String
  },
  parentInputClusterConfigId: {
    type: Schema.Types.ObjectId,
    ref: 'InputClusterConfig'
  },
  autoIsolationConfigId: {
    required: 'Input Cluster Config requires AutoIsolationConfig id',
    type: Schema.Types.ObjectId,
    ref: 'AutoIsolationConfig'
  }
})

InputClusterConfigSchema.plugin(auditPlugin, {
  modelName: 'InputClusterConfig'
})
InputClusterConfigSchema.path('repo').set(function (repo) {
  this.lowerRepo = repo && repo.toLowerCase()
  return repo
})
InputClusterConfigSchema.path('branch').set(function (branch) {
  this.lowerBranch = branch && branch.toLowerCase()
  return branch
})

module.exports = InputClusterConfigSchema
