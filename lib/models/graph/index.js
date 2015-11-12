'use strict'

module.exports = GraphInterface

function GraphInterface () {}

/* expected data formats:
 * node (e.g. `start`):
 * {
 *   label: String,
 *   props: {...}
 * }
 *
 * edge:
 * {
 *   label: String,
 *   props: {...}
 * }
 * one uses a step to define:
 * - what edge to follow to (with optional props)
 * - what node to look for (should contain `label`)
 * step: {
 *  In|Out: {
 *    edge: edge,
 *    node: node
 *  }
 * }
 *
 * steps are sequential defining edges to follow
 * steps:
 * [
 *   step,
 *   ...
 * ]
 *
 * connection:
 * {
 *   start: node,
 *   edge: edge,
 *   end: node
 * }
 */

/**
 * get nodes from the graph, given a starting node and steps
 * @param {object} start - starting node
 * @param {Array(object)} steps - steps to follow
 * @param {function} callback
 */
GraphInterface.prototype.getNodes = function (start, steps, cb) {
  cb(new Error('getNodes not implemented'))
}

/**
 * write nodes to the graph
 * @param {object} nodes - nodes to add to the graph
 * @param {function} callback
 */
GraphInterface.prototype.writeNodes = function (nodes, cb) {
  cb(new Error('writeNodes not implemented'))
}

// GraphInterface.prototype.deleteNodes = function (nodes, cb) {
//   cb(new Error('deleteNodes not implemented'))
// }

/**
 * write connections between nodes
 * @param {Array(object)} connections - edges to add to the graph
 * @param {function} callback
 */
GraphInterface.prototype.writeConnections = function (connections, cb) {
  cb(new Error('writeConnections not implemented'))
}

/**
 * delete connections between nodes
 * @param {Array(object)} connections - edges to remove from the graph
 * @param {function} callback
 */
GraphInterface.prototype.deleteConnections = function (connections, cb) {
  cb(new Error('deleteConnections not implemented'))
}
