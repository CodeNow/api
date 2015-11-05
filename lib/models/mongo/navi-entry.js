/**
 * Navi instance routing data
 * @module models/navi-entry
 */
'use strict';

var mongoose = require('mongoose');

var NaviEntrySchema = require('models/mongo/schemas/navi-entry');

var NaviEntry = module.exports = mongoose.model('NaviEntry', NaviEntrySchema);
