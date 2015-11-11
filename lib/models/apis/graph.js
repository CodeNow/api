/**
 * @module lib/models/apis/graph
 */
'use strict'

var logger = require('middlewares/logger')(__filename)

module.exports = Graph

function Graph (dbType) {
  if (!dbType) {
    dbType = process.env.GRAPH_DATABASE_TYPE
  }
  logger.log.trace({
    dbType: dbType
  }, 'graph database type')
  if (dbType === 'neo4j') {
    var Neo4j = require('models/graph/neo4j')
    this.graph = new Neo4j()
  } else {
    throw new Error('graph requires a valid dbType (' + dbType + ')')
  }
}
