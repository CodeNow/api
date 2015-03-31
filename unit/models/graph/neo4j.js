'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var sinon = require('sinon');

var Graph = require('models/apis/graph');

var requiredEnvVars = {
  NEO4J: 'localhost:7474',
  GRAPH_DATABASE_TYPE: 'neo4j'
};

var ctx = { savedEnvVars: {} };
describe('neo4j driver', function () {
  var graph;
  before(function (done) {
    Object.keys(requiredEnvVars).forEach(function (key) {
      ctx.savedEnvVars[key] = process.env[key];
      process.env[key] = requiredEnvVars[key];
    });
    var neo4j = new Graph();
    graph = neo4j.graph;
    done();
  });
  after(function (done) {
    Object.keys(requiredEnvVars).forEach(function (key) {
      process.env[key] = ctx.savedEnvVars[key];
    });
    done();
  });

  describe('getNodes', function () {
    beforeEach(function (done) {
      sinon.stub(graph, '_query').yieldsAsync(null, null);
      done();
    });
    afterEach(function (done) {
      graph._query.restore();
      done();
    });

    it('should produce correct queries looking for 1 node (no steps)', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      };
      var steps = [];
      var expectedQuery = [
        'MATCH (a:Instance)',
        'WHERE ' +
          'a.id={props}.id AND ' +
          'a.lowerName={props}.lowerName AND ' +
          'a.owner_github={props}.owner_github',
        'RETURN a'
      ].join('\n');
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null();
        expect(data).to.be.null(); // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({ props: start.props });
        done();
      });
    });

    it('should produce correct queries looking for node via out steps', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      };
      var steps = [{
        Out: {
          edge: 'dependsOn',
          node: 'Instance'
        }
      }];
      var expectedQuery = [
        'MATCH (a:Instance)-[:dependsOn]->(b:Instance)',
        'WHERE ' +
          'a.id={props}.id AND ' +
          'a.lowerName={props}.lowerName AND ' +
          'a.owner_github={props}.owner_github',
        'RETURN a,b'
      ].join('\n');
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null();
        expect(data).to.be.null(); // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({ props: start.props });
        done();
      });
    });

    it('should produce correct queries looking for node via out multiple steps', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      };
      var steps = [{
        Out: {
          edge: 'dependsOn',
          node: 'Instance'
        }
      },{
        Out: {
          edge: 'hasHostname',
          node: 'Hostname',
          props: { id: 'somehostname' }
        }
      }];
      var expectedQuery = [
        'MATCH (a:Instance)-[:dependsOn]->(b:Instance)-[:hasHostname]->(c:Hostname)',
        'WHERE ' +
          'a.id={props}.id AND ' +
          'a.lowerName={props}.lowerName AND ' +
          'a.owner_github={props}.owner_github AND ' +
          'c.id={cProps}.id',
        'RETURN a,b,c'
      ].join('\n');
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null();
        expect(data).to.be.null(); // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({
          props: start.props,
          cProps: steps[1].Out.props
        });
        done();
      });
    });

    it('should produce correct queries looking for node via in steps', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      };
      var steps = [{
        In: {
          edge: 'dependsOn',
          node: 'Instance'
        }
      }];
      var expectedQuery = [
        'MATCH (a:Instance)<-[:dependsOn]-(b:Instance)',
        'WHERE ' +
          'a.id={props}.id AND ' +
          'a.lowerName={props}.lowerName AND ' +
          'a.owner_github={props}.owner_github',
        'RETURN a,b'
      ].join('\n');
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null();
        expect(data).to.be.null(); // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({ props: start.props });
        done();
      });
    });

    it('should follow steps with node properties', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      };
      var steps = [{
        Out: {
          edge: 'dependsOn',
          node: 'Instance',
          props: { lowerName: 'some-name' }
        }
      }];
      var expectedQuery = [
        'MATCH (a:Instance)-[:dependsOn]->(b:Instance)',
        'WHERE ' +
          'a.id={props}.id AND ' +
          'a.lowerName={props}.lowerName AND ' +
          'a.owner_github={props}.owner_github AND ' +
          'b.lowerName={bProps}.lowerName',
        'RETURN a,b'
      ].join('\n');
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null();
        expect(data).to.be.null(); // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({
          props: start.props,
          bProps: steps[0].Out.props
        });
        done();
      });
    });
  });

  describe('writeNode', function () {
    beforeEach(function (done) {
      // fake the node being created
      sinon.stub(graph, '_query').yieldsAsync(null, { n: true });
      done();
    });
    afterEach(function (done) {
      graph._query.restore();
      done();
    });

    it('should make a query to write in a unique node', function (done) {
      var node = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      };
      var expectedQuery = [
        'MERGE (n:Instance {id: {props}.id})',
        'ON CREATE SET n.lowerName = {props}.lowerName, ' +
          'n.owner_github = {props}.owner_github',
        'ON MATCH SET n.lowerName = {props}.lowerName, ' +
          'n.owner_github = {props}.owner_github',
        'RETURN n'
      ].join('\n');
      graph.writeNode(node, function (err) {
        expect(err).to.be.null();
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({ props: node.props });
        done();
      });
    });

    it('should make a query to write in a unique node with no props except id', function (done) {
      var node = {
        label: 'Instance',
        props: {
          id: '1234567890asdf'
        }
      };
      var expectedQuery = [
        'MERGE (n:Instance {id: {props}.id})',
        'RETURN n'
      ].join('\n');
      graph.writeNode(node, function (err) {
        expect(err).to.be.null();
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({ props: node.props });
        done();
      });
    });
  });

  describe('writeConnection', function () {
    beforeEach(function (done) {
      sinon.stub(graph, '_query').yieldsAsync(null, { a: true, b: true, r: true });
      done();
    });
    afterEach(function (done) {
      graph._query.restore();
      done();
    });

    it('should make a query to write a connection', function (done) {
      var startNode = {
        label: 'Instance',
        props: {
          id: '1234567890asdf'
        }
      };
      var connectionLabel = 'dependsOn';
      var endNode = {
        label: 'Instance',
        props: {
          id: 'fdsa0987654321'
        }
      };
      var expectedQuery = [
        'MATCH (a:Instance {id: {startProps}.id}),' +
          '(b:Instance {id: {endProps}.id})',
        'MERGE (a)-[r:dependsOn]->(b)',
        'RETURN a,r,b'
      ].join('\n');
      graph.writeConnection(startNode, connectionLabel, endNode, function (err) {
        expect(err).to.be.null();
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({
          startProps: startNode.props,
          endProps: endNode.props
        });
        done();
      });
    });
  });

  describe('deleteConnection', function () {
    beforeEach(function (done) {
      sinon.stub(graph, '_query').yieldsAsync(null, { a: true, b: true, r: true });
      done();
    });
    afterEach(function (done) {
      graph._query.restore();
      done();
    });

    it('should make a query to remove a connection', function (done) {
      var startNode = {
        label: 'Instance',
        props: {
          id: '1234567890asdf'
        }
      };
      var connectionLabel = 'dependsOn';
      var endNode = {
        label: 'Instance',
        props: {
          id: 'fdsa0987654321'
        }
      };
      var expectedQuery = [
        'MATCH (a:Instance {id: {startProps}.id})-[r:dependsOn]->(b:Instance {id: {endProps}.id})',
        'DELETE r'
      ].join('\n');
      graph.deleteConnection(startNode, connectionLabel, endNode, function (err) {
        expect(err).to.be.null();
        expect(graph._query.calledOnce).to.be.true();
        var call = graph._query.getCall(0);
        expect(call.args[0]).to.equal(expectedQuery);
        expect(call.args[1]).to.deep.equal({
          startProps: startNode.props,
          endProps: endNode.props
        });
        done();
      });
    });
  });
});
