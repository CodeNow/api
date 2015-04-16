'use strict';

var async = require('async');
var util  = require('util');
var debug = require('debug')('runnable-api:models:graph:neo4j');
var debugQuery = require('debug')('runnable-api:models:graph:neo4j:queries');
var GraphInterface = require('models/graph/index');
var cypher = require('cypher-stream');
var blacklight = require('blacklight');
var keypather = require('keypather')();
var last = require('101/last');

module.exports = Neo4j;

function Neo4j () {
  GraphInterface.call(this);
  this.cypher = cypher(process.env.NEO4J);
}

util.inherits(Neo4j, GraphInterface);

Neo4j.prototype.getNodeCount = function (nodeLabel, cb) {
  var query = 'MATCH (n:' + nodeLabel + ') RETURN count(*)';
  this._query(query, {}, function (err, data) {
    if (err) { cb(err); }
    else if (!data['count(*)']) { cb(null, -1); }
    else { cb(null, data['count(*)'][0]); }
  });
};

Neo4j.prototype.getNodes = function (start, steps, cb) {
  debug('getNodes');
  var nodes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  var node = nodes.shift();
  var query = 'MATCH (' + node + ':' + start.label + ')';
  var returnVars = [node];
  steps.forEach(function (step) {
    var s;
    var edge = nodes.shift();
    node = nodes.shift();
    if (step.Out) {
      s = step.Out;
      query += '-[' + edge + ':' + s.edge.label + ']->(' + node + ':' + s.node.label + ')';
      returnVars.push(edge, node);
    } else if (step.In) {
      s = step.In;
      query += '<-[' + edge + ':' + s.edge.label + ']-(' + node + ':' + s.node.label + ')';
      returnVars.push(edge, node);
    }
    var props;
    if (s && s.node && s.node.props) {
      s.node.propsName = props = node + 'Props'; // e.g., cProps
      s.node.propsAsQuery = Object.keys(s.node.props).map(function (key) {
        return node + '.' + key + '={' + props + '}.' + key;
      });
    }
    if (s && s.edge && s.edge.props) {
      s.edge.propsName = props = edge + 'Props';
      s.edge.propsAsQuery = Object.keys(s.edge.props).map(function (key) {
        return edge + '.' + key + '={' + props + '}.' + key;
      });
    }
  });
  var params = {
    props: start.props
  };
  var where = [];
  if (start.props) {
    Object.keys(start.props).forEach(function (key) {
      where.push('a.' + key + '={props}.' + key);
    });
  }
  steps.forEach(function (step) {
    if (keypather.get(step, 'In.edge.props')) {
      where = where.concat(step.In.edge.propsAsQuery);
      params[step.In.edge.propsName] = step.In.edge.props;
    } else if (keypather.get(step, 'Out.edge.props')) {
      where = where.concat(step.Out.edge.propsAsQuery);
      params[step.Out.edge.propsName] = step.Out.edge.props;
    }
    if (keypather.get(step, 'In.node.props')) {
      where = where.concat(step.In.node.propsAsQuery);
      params[step.In.node.propsName] = step.In.node.props;
    } else if (keypather.get(step, 'Out.node.props')) {
      where = where.concat(step.Out.node.propsAsQuery);
      params[step.Out.node.propsName] = step.Out.node.props;
    }
  });
  var q = [ query ];
  if (where.length) { q.push('WHERE ' + where.join(' AND ')); }
  q.push('RETURN ' + returnVars.join(','));
  q = q.join('\n');

  debugQuery('query %s', blacklight.escape(q));
  debugQuery('props', JSON.stringify(start), JSON.stringify(steps));
  this._query(q, params, function (err, data) {
    if (err) { cb(err); }
    else if (!data) { cb(null, null); }
    else {
      var d = data[last(returnVars)] || [];
      debugQuery('returning ' + d.length + ' nodes');
      cb(err, d, data);
    }
  });
};

Neo4j.prototype.writeConnections = function (connections, cb) {
  if (connections.length === 0) { return cb(); }
  var self = this;
  async.mapSeries(
    connections,
    function (conn, cb) {
      conn.push(cb);
      self._createUniqueRelationship.apply(self, conn);
    },
    cb);
};

Neo4j.prototype.writeConnection = 
Neo4j.prototype._createUniqueRelationship = 
function (start, relationship, end, cb) {
  debug('creating relationship');
  var q = [
    'MATCH (a:' + start.label + ' {id: {startProps}.id}),' +
      '(b:' + end.label + ' {id: {endProps}.id})',
    'MERGE (a)-[r:' + relationship.label + ']->(b)'
  ];

  if (relationship.props) {
    var ps = Object.keys(relationship.props).map(function (p) {
      return 'r.' + p + '=\'' + relationship.props[p] + '\'';
    });
    q.push('ON CREATE SET ' + ps.join(', '));
    q.push('ON MATCH SET ' + ps.join(', '));
  }

  q.push('RETURN a,r,b');
  q = q.join('\n');

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
  this._query(q, p, cb);
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
    'MERGE (n:' + node.label + ' {id: {props}.id})'
  ];
  if (nodeProps.length) {
    q.push('ON CREATE SET ' + nodeProps.join(', '));
    q.push('ON MATCH SET ' + nodeProps.join(', '));
  }
  q.push('RETURN n');
  q = q.join('\n');
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
