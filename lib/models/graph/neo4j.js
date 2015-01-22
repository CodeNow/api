'use strict';

var async = require('async');
var util  = require('util');
var debug = require('debug')('runnable-api:models:graph:neo4j');
var debugQuery = require('debug')('runnable-api:models:graph:neo4j:queries');
var GraphInterface = require('models/graph/index');
// var neo4j = require('neo4j');
var cypher = require('cypher-stream');

module.exports = Neo4j;

function Neo4j () {
  GraphInterface.call(this);
  // this.db = new neo4j.GraphDatabase('http://localhost:7474/');
  this.cypher = cypher('http://localhost:7474');
}

util.inherits(Neo4j, GraphInterface);

Neo4j.prototype.getNodes = function (start, steps, cb) {
  var query = 'MATCH (a:_node)';
  var returnVar = 'a';
  steps.forEach(function (step) {
    if (step.Out) {
      query += '-[:' + step.Out + ']->(b:_node)';
      returnVar = 'b';
    } else if (step.In) {
      query += '<-[:' + step.In + ']-(c:_node)';
      returnVar = 'c';
    }
  });
  var q = [
    query,
    'WHERE a.id={start}',
    'RETURN ' + returnVar
  ].join('\n');
  var params = {
    start: start
  };
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
  async.series([
    function writeNodes (cb) {
      var conns = connections.reduce(function (prev, curr) {
        if (prev.indexOf(curr.subject) === -1) { prev.push(curr.subject); }
        if (prev.indexOf(curr.object) === -1) { prev.push(curr.object); }
        return prev;
      }, []);
      async.mapSeries(
        conns,
        function (conn, cb) {
          self._createUniqueNode({ id: conn }, cb);
        },
        cb);
    },
    function writeRelationships (cb) {
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
    }
  ], cb);
};

Neo4j.prototype.deleteConnections = function (connections, cb) {
  var self = this;
  if (connections.length === 0) { return cb(); }
  async.mapSeries(
    connections,
    function (conn, cb) {
      self._deleteRelationship(
        { id: conn.subject },
        conn.predicate,
        { id: conn.object },
        cb);
    }, cb);
};

Neo4j.prototype._createUniqueNode = function (nodeProps, cb) {
  debug('create unique node %s', JSON.stringify(nodeProps));
  var label = nodeProps.label || '_node';
  delete nodeProps.label;

  var q = [
    'MERGE (n:' + label + ' {id: {props}.id})',
    'RETURN n'
  ].join('\n');

  var p = {
    props: nodeProps
  };

  debugQuery('query %s', q.replace('\n', ' '));
  this._query(q, p, function (err, data) {
    if (err) { cb(err); }
    else if (!data.n) {
      cb(new Error('node was not created in graph'));
    } else {
      cb();
    }
  });
};

Neo4j.prototype._createUniqueRelationship = function (start, relationshipLabel, end, cb) {
  debug('creating relationship %s %s %s', start.id, relationshipLabel, end.id);
  var startLabel = start.label || '_node';
  delete start.label;
  var endLabel = end.label || '_node';
  delete end.label;

  var q = [
    'MATCH (a:' + startLabel + ' {id: {startProps}.id}),(b:' + endLabel + ' {id: {endProps}.id})',
    'MERGE (a)-[r:' + relationshipLabel + ']->(b)',
    'RETURN a,r,b'
  ].join('\n');

  var p = {
    startProps: start,
    endProps: end,
  };

  this._query(q, p, function (err, data) {
    if (err) { cb(err); }
    else if (!data.a || !data.r || !data.b) {
      cb(new Error('relationship was not created in neo4j graph'));
    } else {
      cb();
    }
  });
};

Neo4j.prototype._deleteRelationship = function (start, relationshipLabel, end, cb) {
  debug('deleting relationship %s %s %s', start.id, relationshipLabel, end.id);
  var startLabel = start.label || '_node';
  delete start.label;
  var endLabel = end.label || '_node';
  delete end.label;

  var q = [
    'MATCH (a:' + startLabel + ' {id: {startProps}.id})-' +
      '[r:' + relationshipLabel + ']->' + '(b:' + endLabel + ' {id: {endProps}.id})',
    'DELETE r'
  ].join('\n');
  var p = {
    startProps: start,
    endProps: end
  };

  debugQuery('query %s', q.replace('\n', ' '));
  debugQuery('params %s', JSON.stringify(p));
  this._query(q, p, function (err, data) {
    cb(err, data);
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
  t.on('error', function (err) {
    err = new Error();
  });
  t.commit();
};
