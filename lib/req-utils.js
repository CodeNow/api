'use strict';
/**
 * used to return specific information from a express request object
 * this file should only contain helper functions for express request object
 * @module req-utils
 */

/**
 * use port information from req to determine protocol
 * @param  {object} req      express request object
 * @return {string} protocol of request (including ://)
 */
module.exports.getProtocol = function(req) {
  var host = req.headers.host;
  // append 80 if port not in url
  if (!~host.indexOf(':')) {
    host = host + ':80';
  }
  // we only support https on port 443
  var protocol = host.split(':')[1] === '443' ?
    'https://' : 'http://';

  return protocol;
};
