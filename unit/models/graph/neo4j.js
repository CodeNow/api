'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var sinon = require('sinon')

var Graph = require('models/apis/graph')

var requiredEnvVars = {
  NEO4J: 'localhost:7474',
  GRAPH_DATABASE_TYPE: 'neo4j'
}

var ctx = { savedEnvVars: {} }
var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('neo4j driver: ' + moduleName, function () {
  var graph
  before(function (done) {
    Object.keys(requiredEnvVars).forEach(function (key) {
      ctx.savedEnvVars[key] = process.env[key]
      process.env[key] = requiredEnvVars[key]
    })
    var neo4j = new Graph()
    graph = neo4j.graph
    done()
  })
  after(function (done) {
    Object.keys(requiredEnvVars).forEach(function (key) {
      process.env[key] = ctx.savedEnvVars[key]
    })
    done()
  })

  describe('getNodeCount', function () {
    beforeEach(function (done) {
      sinon.stub(graph, '_query').yieldsAsync(null, {
        'count(*)': [1]
      })
      done()
    })
    afterEach(function (done) {
      graph._query.restore()
      done()
    })

    it('should be able make a query to get the count of nodes', function (done) {
      var expectedQuery = 'MATCH (n:Instance) RETURN count(*)'
      graph.getNodeCount('Instance', function (err, data) {
        expect(err).to.be.null()
        expect(data).to.equal(1) // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({})
        done()
      })
    })
  })

  describe('getNodes', function () {
    beforeEach(function (done) {
      sinon.stub(graph, '_query').yieldsAsync(null, null)
      done()
    })
    afterEach(function (done) {
      graph._query.restore()
      done()
    })

    it('should produce correct queries looking for 1 node (no steps)', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      }
      var steps = []
      var expectedQuery = [
        'MATCH (a:Instance)',
        'WHERE ' +
        'a.id={props}.id AND ' +
        'a.lowerName={props}.lowerName AND ' +
        'a.owner_github={props}.owner_github',
        'RETURN a'
      ].join('\n')
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null()
        expect(data).to.be.null() // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({ props: start.props })
        done()
      })
    })

    it('should produce correct queries looking for node via out steps', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      }
      var steps = [{
        Out: {
          edge: { label: 'dependsOn' },
          node: { label: 'Instance' }
        }
      }]
      var expectedQuery = [
        'MATCH (a:Instance)-[b:dependsOn]->(c:Instance)',
        'WHERE ' +
        'a.id={props}.id AND ' +
        'a.lowerName={props}.lowerName AND ' +
        'a.owner_github={props}.owner_github',
        'RETURN a,b,c'
      ].join('\n')
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null()
        expect(data).to.be.null() // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({ props: start.props })
        done()
      })
    })

    it('should produce correct queries looking for node via out multiple steps', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      }
      var steps = [{
        Out: {
          edge: { label: 'dependsOn' },
          node: { label: 'Instance' }
        }
      }, {
        Out: {
          edge: { label: 'hasHostname' },
          node: {
            label: 'Hostname',
            props: { id: 'somehostname' }
          }
        }
      }]
      var expectedQuery = [
        'MATCH (a:Instance)-[b:dependsOn]->(c:Instance)-[d:hasHostname]->(e:Hostname)',
        'WHERE ' +
        'a.id={props}.id AND ' +
        'a.lowerName={props}.lowerName AND ' +
        'a.owner_github={props}.owner_github AND ' +
        'e.id={eProps}.id',
        'RETURN a,b,c,d,e'
      ].join('\n')
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null()
        expect(data).to.be.null() // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({
          props: start.props,
          eProps: steps[1].Out.node.props
        })
        done()
      })
    })

    it('should produce correct queries looking for node via in steps', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      }
      var steps = [{
        In: {
          edge: { label: 'dependsOn' },
          node: { label: 'Instance' }
        }
      }]
      var expectedQuery = [
        'MATCH (a:Instance)<-[b:dependsOn]-(c:Instance)',
        'WHERE ' +
        'a.id={props}.id AND ' +
        'a.lowerName={props}.lowerName AND ' +
        'a.owner_github={props}.owner_github',
        'RETURN a,b,c'
      ].join('\n')
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null()
        expect(data).to.be.null() // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({ props: start.props })
        done()
      })
    })

    it('should follow steps with edge properties', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      }
      var steps = [{
        Out: {
          edge: {
            label: 'dependsOn',
            props: { hostname: 'somehostname' }
          },
          node: {
            label: 'Instance',
            props: { lowerName: 'somename' }
          }
        }
      }]
      var expectedQuery = [
        'MATCH (a:Instance)-[b:dependsOn]->(c:Instance)',
        'WHERE ' +
        'a.id={props}.id AND ' +
        'a.lowerName={props}.lowerName AND ' +
        'a.owner_github={props}.owner_github AND ' +
        'b.hostname={bProps}.hostname AND ' +
        'c.lowerName={cProps}.lowerName',
        'RETURN a,b,c'
      ].join('\n')
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null()
        expect(data).to.be.null() // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({
          props: start.props,
          bProps: steps[0].Out.edge.props,
          cProps: steps[0].Out.node.props
        })
        done()
      })
    })

    it('should follow steps with node properties', function (done) {
      var start = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      }
      var steps = [{
        Out: {
          edge: { label: 'dependsOn' },
          node: {
            label: 'Instance',
            props: { lowerName: 'some-name' }
          }
        }
      }]
      var expectedQuery = [
        'MATCH (a:Instance)-[b:dependsOn]->(c:Instance)',
        'WHERE ' +
        'a.id={props}.id AND ' +
        'a.lowerName={props}.lowerName AND ' +
        'a.owner_github={props}.owner_github AND ' +
        'c.lowerName={cProps}.lowerName',
        'RETURN a,b,c'
      ].join('\n')
      graph.getNodes(start, steps, function (err, data) {
        expect(err).to.be.null()
        expect(data).to.be.null() // because that's what we set the stub to
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({
          props: start.props,
          cProps: steps[0].Out.node.props
        })
        done()
      })
    })
  })

  describe('writeNode', function () {
    beforeEach(function (done) {
      // fake the node being created
      sinon.stub(graph, '_query').yieldsAsync(null, { n: true })
      done()
    })
    afterEach(function (done) {
      graph._query.restore()
      done()
    })

    it('should make a query to write in a unique node', function (done) {
      var node = {
        label: 'Instance',
        props: {
          id: '1234567890asdf',
          lowerName: 'sample-instance',
          owner_github: 1234
        }
      }
      var expectedQuery = [
        'MERGE (n:Instance {id: {props}.id})',
        'ON CREATE SET n.lowerName = {props}.lowerName, ' +
        'n.owner_github = {props}.owner_github',
        'ON MATCH SET n.lowerName = {props}.lowerName, ' +
        'n.owner_github = {props}.owner_github',
        'RETURN n'
      ].join('\n')
      graph.writeNode(node, function (err) {
        expect(err).to.be.null()
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({ props: node.props })
        done()
      })
    })

    it('should make a query to write in a unique node with no props except id', function (done) {
      var node = {
        label: 'Instance',
        props: {
          id: '1234567890asdf'
        }
      }
      var expectedQuery = [
        'MERGE (n:Instance {id: {props}.id})',
        'RETURN n'
      ].join('\n')
      graph.writeNode(node, function (err) {
        expect(err).to.be.null()
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({ props: node.props })
        done()
      })
    })
  })

  describe('deleteNodeAndConnections', function () {
    beforeEach(function (done) {
      // fake the node being created
      sinon.stub(graph, '_query').yieldsAsync(null, { n: true })
      done()
    })
    afterEach(function (done) {
      graph._query.restore()
      done()
    })

    it('should make a query to delete the node and all connections', function (done) {
      var node = {
        label: 'Instance',
        props: {
          id: '1234567890asdf'
        }
      }
      var expectedQuery = [
        'MATCH (n:Instance {id: {props}.id})',
        'OPTIONAL MATCH (n)-[r]-()',
        'DELETE n,r'
      ].join('\n')
      graph.deleteNodeAndConnections(node, function (err) {
        expect(err).to.be.null()
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({ props: node.props })
        done()
      })
    })
  })

  describe('writeConnection', function () {
    beforeEach(function (done) {
      sinon.stub(graph, '_query').yieldsAsync(null, { a: true, b: true, r: true })
      done()
    })
    afterEach(function (done) {
      graph._query.restore()
      done()
    })

    it('should make a query to write a connection', function (done) {
      var startNode = {
        label: 'Instance',
        props: {
          id: '1234567890asdf'
        }
      }
      var connection = {
        label: 'dependsOn'
      }
      var endNode = {
        label: 'Instance',
        props: {
          id: 'fdsa0987654321'
        }
      }
      var expectedQuery = [
        'MATCH (a:Instance {id: {startProps}.id}),' +
        '(b:Instance {id: {endProps}.id})',
        'MERGE (a)-[r:dependsOn]->(b)',
        'RETURN a,r,b'
      ].join('\n')
      graph.writeConnection(startNode, connection, endNode, function (err) {
        expect(err).to.be.null()
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({
          startProps: startNode.props,
          endProps: endNode.props
        })
        done()
      })
    })

    it('should make a query to write a connection with props', function (done) {
      var startNode = {
        label: 'Instance',
        props: {
          id: '1234567890asdf'
        }
      }
      var connection = {
        label: 'dependsOn',
        props: {
          since: 'forever'
        }
      }
      var endNode = {
        label: 'Instance',
        props: {
          id: 'fdsa0987654321'
        }
      }
      var expectedQuery = [
        'MATCH (a:Instance {id: {startProps}.id}),' +
        '(b:Instance {id: {endProps}.id})',
        'MERGE (a)-[r:dependsOn]->(b)',
        "ON CREATE SET r.since='forever'",
        "ON MATCH SET r.since='forever'",
        'RETURN a,r,b'
      ].join('\n')
      graph.writeConnection(startNode, connection, endNode, function (err) {
        expect(err).to.be.null()
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({
          startProps: startNode.props,
          endProps: endNode.props
        })
        done()
      })
    })
  })

  describe('deleteConnection', function () {
    beforeEach(function (done) {
      sinon.stub(graph, '_query').yieldsAsync(null, { a: true, b: true, r: true })
      done()
    })
    afterEach(function (done) {
      graph._query.restore()
      done()
    })

    it('should make a query to remove a connection', function (done) {
      var startNode = {
        label: 'Instance',
        props: {
          id: '1234567890asdf'
        }
      }
      var connectionLabel = 'dependsOn'
      var endNode = {
        label: 'Instance',
        props: {
          id: 'fdsa0987654321'
        }
      }
      var expectedQuery = [
        'MATCH (a:Instance {id: {startProps}.id})-[r:dependsOn]->(b:Instance {id: {endProps}.id})',
        'DELETE r'
      ].join('\n')
      graph.deleteConnection(startNode, connectionLabel, endNode, function (err) {
        expect(err).to.be.null()
        expect(graph._query.calledOnce).to.be.true()
        var call = graph._query.getCall(0)
        expect(call.args[0]).to.equal(expectedQuery)
        expect(call.args[1]).to.deep.equal({
          startProps: startNode.props,
          endProps: endNode.props
        })
        done()
      })
    })
  })
})
