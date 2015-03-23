'use strict';

var debug = require('debug')('runnable-api:models:apis:graph');

module.exports = Graph;

function Graph (dbType) {
  if (!dbType) {
    dbType = process.env.GRAPH_DATABASE_TYPE;
  }
  debug('graph database type ' + dbType);
  if (dbType === 'neo4j') {
    var Neo4j = require('models/graph/neo4j');
    this.graph = new Neo4j();
  } else {
    throw new Error('graph requires a valid dbType (' + dbType + ')');
  }
}

