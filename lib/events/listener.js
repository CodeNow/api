'use strict';
var subscriber = require('models/redis').createClient();

/**
 * maps functions to be ran to events
 * @type {Object}
 */
var eventStore = {};

/**
 * will run all callback functions registered for event
 * If functions do not exist, skip
 */
subscriber.on('pmessage', function (pattern, eventName, data) {
  if (eventStore[pattern]) {
    eventStore[pattern].forEach(function(fn) {
      fn(JSON.parse(data));
    });
  }
});

/**
 * add function handler to event.
 * @param  'string'   eventName event to register callback for. glob-style patterns
 * @param  {Function} fn        function to call when event is seen
 */
function on (eventName, fn) {
  if (!eventStore[eventName])  {
    eventStore[eventName] = [fn];
  } else {
    eventStore[eventName].push(fn);
  }
  subscriber.psubscribe(eventName);
}

/**
 * clear all registered functions
 * @param  'string'   eventName event to clear callbacks for. glob-style patterns
 */
function removeAllListeners () {
  eventStore = {};
  subscriber.punsubscribe('*');
}

module.exports.on = on;
module.exports.removeAllListeners = removeAllListeners;
