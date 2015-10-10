/**
 * MixPanel SDK event tracking wrapped functionality
 * @module lib/models/apis/mixpanel
 */
'use strict';

var Mixpanel = require('mixpanel');
var assign = require('101/assign');

var logger = require('middlewares/logger')(__filename);

module.exports = MixPanelModel;

/**
 * MixPanelModel
 * wraps runnable-api mixpanel SDK event tracking method invokations
 * @param {Object} user - user model instance
 * @class
 */
function MixPanelModel(user) {
  logger.log.info({
    tx: true,
    user: user
  }, 'MixPanelModel constructor');
  this._user = user;
  if (!process.env.MIXPANEL_APP_ID) {
    logger.log.info('stubbing mixpanel, no APP_ID');
    return;
  }
  this._mixpanel = Mixpanel.init(process.env.MIXPANEL_APP_ID);
  this._mixpanel.people.set(user.accounts.github.id, user);
  /**
   * Extend per-event data with specific properties
   * @param {Object} data - data for given event to be extended
   * @return {Object} - extended data
   */
  this.extendEventData = function(data) {
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
MixPanelModel.prototype.track = function(eventName, eventData) {
  logger.log.info({
    tx: true,
    eventName: eventName,
    eventData: eventData
  }, 'MixPanelModel.prototype.track');
  if (!this._mixpanel) {
    return;
  }
  eventData = this.extendEventData(eventData);
  this._mixpanel.track(eventName, eventData);
};
