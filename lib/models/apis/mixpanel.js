/**
 * MixPanel SDK event tracking wrapped functionality
 * @module lib/models/mixpanel
 */
'use strict';

/*
var Mixpanel = require('mixpanel');
var mixpanel = Mixpanel.init(process.env.MIXPANEL_APP_ID);
var debug = require('../debug');
*/
module.exports = MixPanelModel;

/**
 * MixPanelModel
 * wraps runnable-api mixpanel SDK event tracking method invokations
 * @class
 */
function MixPanelModel () {}

MixPanelModel.prototype.track = function () {};
