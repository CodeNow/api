'use strict';

var mongoose = require('mongoose');

var BuildSchema = require('models/mongo/schemas/build');

module.exports = mongoose.model('Builds', BuildSchema);
