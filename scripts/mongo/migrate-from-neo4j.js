'use strict'
/**
 * This script updates all instances to save their hostname (and elasticHostname) to the database.
 * It also saves the name of the owner from github (if it wasn't already there)
 */
require('loadenv')()
var exists = require('101/exists')
var keypather = require('keypather')()
var mongoose = require('mongoose')

var Instances = require('models/mongo/instance')
var Graph = require('models/apis/graph')

mongoose.connect(process.env.MONGO)
var Promise = require('bluebird')

var client = new Graph()
var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)
var count = 0
Instances.findAsync({})
  .tap(function (instances) {
    console.log('updating', instances.length, 'instances')
  })
  .each(function (i) {
    // fetch all the dependencies for each instance
    return clearDependency(i)
      .then(function () {
        return getDepsFromNeo(i)
      })
      .tap(function (deps) {
        console.log('This instance ', i.name, 'has', deps.length, 'dependencies')
      })
      .each(function (depInstance) {
        if (!depInstance) {
          return 'bad dep'
        }
        count++
        if (!dryRun) {
          return addDependency(i, depInstance)
        }
      })
      .catch(function (err) {
        console.error('This instance ', i.name, 'has failed due to ', err)
      })
  })
  .then(function () {
    console.log('updated', count, 'dependencies')
    process.exit(0)
  })
  .catch(function (err) {
    console.error('error happened', err)
    return process.exit(1)
  })

function generateGraphNodeNeo (instance) {
  var node = {
    label: 'Instance',
    props: {
      id: instance.id.toString(),
      shortHash: instance.shortHash,
      name: instance.name,
      lowerName: instance.lowerName,
      // eslint dislikes quoted props and non-camelcase keys. such contradiction
      'owner_github': keypather.get(instance, 'owner.github'), // eslint-disable-line quote-props
      'contextVersion_context': // eslint-disable-line quote-props
        keypather.get(instance, 'contextVersion.context').toString()
    }
  }
  if (instance.isolated) {
    node.props.isolated = instance.isolated
  }
  return node
}

/**
 * Goes through a given instance's dependencies, looking for a match for the given elasticHostname
 *
 * @param {Instance} instance        - Instance with dependencies to search through
 * @param {String}   elasticHostname - elastic hostname to search
 *
 * @returns {GraphNode|null} Either the matching node for the given hostname, or null
 */
function getDepFromInstance (instance, elasticHostname) {
  if (keypather.get(instance, 'dependencies.length')) {
    var deps = instance.dependencies.filter(function (dep) {
      return dep.elasticHostname === elasticHostname
    })
    return deps.length ? deps[0] : null
  }
}
function generateGraphNode (instance) {
  return {
    elasticHostname: instance.elasticHostname,
    instanceId: instance._id,
    name: instance.name
  }
}

function clearDependency (thisInstance) {
  if (dryRun) {
    return Promise.resolve(thisInstance)
  }
  return Instances.findOneAndUpdateAsync({
    _id: thisInstance._id
  }, {
    $set: {
      dependencies: []
    }
  })
}
/**
 * Adds the given instance to THIS instance's dependency list
 *
 * @param    {Instance} thisInstance - this instance to add dependencies to
 * @param    {Instance} instance     - instance to become a dependent
 *
 * @returns  {Promise}         When the dependency has been added
 * @resolves {Instance}        This instance, updated
 * @throws   {Boom.badRequest} If the update failed
 * @throws   {Error}           Any Mongo error
 */
function addDependency (thisInstance, instance) {
  var elasticHostname = instance.elasticHostname.toLowerCase()
  var node = generateGraphNode(instance)
  console.log('\nInstance', thisInstance.name, 'adding dep', JSON.stringify(node))
  return Instances.findOneAndUpdateAsync({
    _id: thisInstance._id
  }, {
    $push: {
      dependencies: node
    }
  })
    .tap(function (updatedInstance) {
      if (!updatedInstance) {
        // the update failed
        throw new Error('Instance deps not updated!', {
          dependency: instance._id.toString(),
          dependent: thisInstance._id.toString()
        })
      }
    })
    .then(function (instance) {
      return getDepFromInstance(instance, elasticHostname)
    })
    .finally(function () {
      thisInstance.invalidateContainerDNS()
    })
}

function getDepsFromNeo (thisInstance) {
  var self = thisInstance
  return _getDeps(thisInstance, [])
    .then(function (deps) {
      // Annotate dependencies with additional instance information (currently
      // only adding network information for charon)
      return Promise.filter(deps, function (dep) {
        return self._id.toString() !== dep.id
      })
        .map(function annotateWithInstanceFields (dep) {
          return Instances.findByIdAsync(dep.id)
        })
    })

  function _getDeps (instance) {
    // hack to get valid starting node if we pass an existing node
    var start = generateGraphNodeNeo(instance)
    if (start.hostname) {
      delete start.hostname
    }
    var stepEdge = {
      label: 'dependsOn'
    }
    var steps = [{
      Out: {
        edge: stepEdge,
        node: { label: 'Instance' }
      }
    }]
    return Promise.fromCallback(
      function (cb) {
        client.graph.getNodes(start, steps, cb)
      },
      {multiArgs: true}
      )
      .spread(function (nodes, allNodes) {
        nodes = fixNodes(nodes, allNodes)
        return nodes
      })
  }
}

/**
 * fixes keys on node to match out instance objects
 * @param  {object} nodes    array of nodes returned from graph.getNodes
 * @param  {object} allNodes array of allNodes returned from graph.getNodes
 * @return {object}          array of nodes with keys fixed
 */
function fixNodes (nodes, allNodes) {
  var hostnames = allNodes.b
  // fix owner_github -> owner.github
  // fix contextVersion_context -> contextVersion.context
  var fixes = {
    'owner_github': 'owner.github', // eslint-disable-line quote-props
    'contextVersion_context': 'contextVersion.context' // eslint-disable-line quote-props
  }
  nodes.forEach(function (n, i) {
    // set hostnames (from the edges) on the nodes
    keypather.set(n, 'hostname', hostnames[i].hostname)
    Object.keys(fixes).forEach(function (key) {
      if (keypather.get(n, key) && !keypather.get(n, fixes[key])) {
        keypather.set(n, fixes[key], n[key])
        delete n[key]
      }
    })
  })
  return nodes
}
