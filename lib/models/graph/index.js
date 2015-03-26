'use strict';

module.exports = GraphInterface;

function GraphInterface () {}

/* expected data formats:
 * node (e.g. `start`):
 * {
 *   label: String,
 *   props: {...}
 * }
 *
 * TODO(bryan): define what In and Out are
 * steps:
 * [
 *   { In: ???? },
 *   { Out: ???? }
 * ]
 *
 * connection:
 * {
 *   start: node,
 *   edge: String,
 *   end: node
 * }
 */

GraphInterface.prototype.getNodes = function (start, steps, cb) {
  cb(new Error('getNodes not implemented'));
};

GraphInterface.prototype.writeNodes = function (nodes, cb) {
  cb(new Error('writeNodes not implemented'));
};

// GraphInterface.prototype.deleteNodes = function (nodes, cb) {
//   cb(new Error('deleteNodes not implemented'));
// };

GraphInterface.prototype.writeConnections = function (connections, cb) {
  cb(new Error('writeConnections not implemented'));
};

GraphInterface.prototype.deleteConnections = function (connections, cb) {
  cb(new Error('deleteConnections not implemented'));
};
