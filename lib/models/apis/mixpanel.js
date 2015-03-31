/**
 * MixPanel SDK event tracking wrapped functionality
 * @module lib/models/mixpanel
 */
'use strict';

var Mixpanel = require('mixpanel');
var assign = require('101/assign');
var debug = require('debug')('runnable-api:models:mixpanel');

module.exports = MixPanelModel;

/**
 * MixPanelModel
 * wraps runnable-api mixpanel SDK event tracking method invokations
 * @param {Object} user - user model instance
 * @class
 */
function MixPanelModel (user) {
  debug('create MixPanelModel', user);
  this._user = user;
  this._mixpanel = Mixpanel.init(process.env.MIXPANEL_APP_ID);
  this._mixpanel.people.set(user.accounts.github.id, user);
  /**
   * Extend per-event data with specific properties
   * @param {Object} data - data for given event to be extended
   * @return {Object} - extended data
   */
  this.extendEventData = function (data) {
    var baseData = {}; //TODO: determine which data to send
                       // with all events
    return assign(data, baseData);
  };
}

/**
 * Wrapper method for mixpanel SDK track method, invokes with consistent
 * base data.
 * @param {String} eventName - name of event for reporting in mixpanel
 * @param {Object} eventData - key/values of event
 * @param {Function} cb - callback
 * @return null
 */
MixPanelModel.prototype.track = function (eventName, eventData, cb) {
  debug('MixPanelModel - event', eventName, eventData);
  eventData = this.extendEventData(eventData);
  this._mixpanel.track(eventName, eventData);
  return cb(null);
};
