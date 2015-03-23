'use strict';

var async = require('async');
var util  = require('util');
var debug = require('debug')('runnable-api:models:graph:neo4j');
var debugQuery = require('debug')('runnable-api:models:graph:neo4j:queries');
var GraphInterface = require('models/graph/index');
var url = require('url');
var cypher = require('cypher-stream');
var blacklight = require('blacklight');

module.exports = Neo4j;

function Neo4j () {
  GraphInterface.call(this);
  var neo4jHost = process.env.NEO4J || 'localhost:7474';
  var neo4j = url.format({
    protocol: 'http:',
    slashes: true,
    host: neo4jHost
  });
  this.cypher = cypher(neo4j);
}

util.inherits(Neo4j, GraphInterface);

Neo4j.prototype.getNodes = function (start, steps, cb) {
  debug('getNodes');
  var query = 'MATCH (a:' + start.label + ')';
  var returnVar = 'a';
  steps.forEach(function (step) {
    if (step.Out) {
      query += '-[:' + step.Out.edge + ']->(b:' + step.Out.node + ')';
      returnVar = 'b';
    } else if (step.In) {
      query += '<-[:' + step.In + ']-(c:_node)';
      returnVar = 'c';
    }
  });
  var where = [];
  if (start.props) {
    Object.keys(start.props).forEach(function (key) {
      where.push('a.' + key + '={props}.' + key);
    });
  }
  var q = [ query ];
  if (where.length) { q.push('WHERE ' + where.join(' AND ')); }
  q.push('RETURN ' + returnVar);
  q = q.join('\n');
  var params = {
    props: start.props
  };

  debugQuery('query %s', blacklight.escape(q));
  debugQuery('props', JSON.stringify(start), JSON.stringify(steps));
  this._query(q, params, function (err, data) {
    if (err) { cb(err); }
    else if (!data) { cb(null, null); }
    else {
      var d = data[returnVar] || [];
      debugQuery('returning ' + d.length + ' nodes');
      cb(err, d);
    }
  });
};

Neo4j.prototype.writeConnections = function (connections, cb) {
  if (connections.length === 0) { return cb(); }
  var self = this;
  async.mapSeries(
    connections,
    function (conn, cb) {
      self._createUniqueRelationship(
        { id: conn.subject },
        conn.predicate,
        { id: conn.object },
        cb);
    },
    cb);
};

Neo4j.prototype.writeConnection = 
Neo4j.prototype._createUniqueRelationship = 
function (start, relationshipLabel, end, cb) {
  debug('creating relationship');
  var q = [
    'MATCH (a:' + start.label + ' {id: {startProps}.id}),' +
      '(b:' + end.label + ' {id: {endProps}.id})',
    'MERGE (a)-[r:' + relationshipLabel + ']->(b)',
    'RETURN a,r,b'
  ].join('\n');

  var p = {
    startProps: start.props,
    endProps: end.props,
  };

  debugQuery('query %s', blacklight.escape(q));
  this._query(q, p, function (err, data) {
    if (err) { cb(err); }
    else if (!data.a || !data.r || !data.b) {
      cb(new Error('relationship was not created in neo4j graph'));
    } else {
      cb(null);
    }
  });
};

Neo4j.prototype.deleteConnections = function (connections, cb) {
  var self = this;
  if (connections.length === 0) { return cb(); }
  async.mapSeries(
    connections,
    function (conn, cb) {
      self._deleteConnection(
        { id: conn.subject },
        conn.predicate,
        { id: conn.object },
        cb);
    }, cb);
};

Neo4j.prototype.deleteConnection =
Neo4j.prototype._deleteConnection = function (start, relationshipLabel, end, cb) {
  debug('deleting relationship');
  var q = [
    'MATCH (a:' + start.label + ' {id: {startProps}.id})-' +
      '[r:' + relationshipLabel + ']->' + '(b:' + end.label + ' {id: {endProps}.id})',
    'DELETE r'
  ].join('\n');
  var p = {
    startProps: start.props,
    endProps: end.props
  };

  debugQuery('query %s', blacklight.escape(q));
  debugQuery('params %s', JSON.stringify(p));
  this._query(q, p, function (err, data) {
    cb(err, data);
  });
};

Neo4j.prototype.writeNodes = function (nodes, cb) {
  var self = this;
  async.forEach(
    nodes,
    function (n, cb) { self._writeUniqueNode(n, cb); },
    function (err) {
      if (err) { return cb(err); }
      cb(null);
    });
};

// don't know if I want other node-writers, so leaving it with a _name for now too
Neo4j.prototype.writeNode = Neo4j.prototype._writeUniqueNode = function (node, cb) {
  debug('create unique node %s', JSON.stringify(node));
  var nodeProps = [];
  Object.keys(node.props).forEach(function (key) {
    if (key !== 'id') {
      nodeProps.push('n.' + key + ' = {props}.' + key);
    }
  });
  var q = [
    'MERGE (n:' + node.label + ' {id: {props}.id})',
    'ON CREATE SET ' + nodeProps.join(', '),
    'ON MATCH SET ' + nodeProps.join(', '),
    'RETURN n'
  ].join('\n');
  var p = {
    props: node.props
  };

  debugQuery('query %s', blacklight.escape(q));
  debugQuery('props', JSON.stringify(node));
  this._query(q, p, function (err, data) {
    if (err) { cb(err); }
    else if (!data || !data.n) {
      cb(new Error('node was not created in graph'));
    } else {
      cb(null);
    }
  });
};

Neo4j.prototype._query = function (q, p, cb) {
  var t = this.cypher.transaction();
  t.write({
    statement: q,
    parameters: p
  });
  var err = null;
  var data = {};
  t.on('data', function (d) {
    if (d) {
      Object.keys(d).forEach(function (key) {
        if (!data[key]) { data[key] = [d[key]]; }
        else { data[key].push(d[key]); }
      });
    }
  });
  t.on('end', function () {
    cb(err, data);
  });
  t.on('error', function (e) {
    err = e;
  });
  t.commit();
};
