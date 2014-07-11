// 'use strict';

// var mongoose = require('mongoose');
// var BaseSchema = require('models/mongo/schemas/base');
// var Schema = mongoose.Schema;
// var ObjectId = Schema.ObjectId;
// var extend = require('extend');
// var Boom = require('dat-middleware').Boom;
// var validators = require('../schemas/schema-validators').commonValidators;
// // var debug = require('debug')('runnable-api:owner:model');

// /** @alias module:models/user */
// var OwnerSchema = module.exports = new Schema({
//   runnable: {
//     type: ObjectId,
//     validate: validators.objectId({ model: 'Owner', literal: 'Runnable Owner' })
//   },
//   github: {
//     type: Number,
//     // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
//   }
// });

// OwnerSchema.set('toJSON', { virtuals: true });

// extend(OwnerSchema.methods, BaseSchema.methods);
// extend(OwnerSchema.statics, BaseSchema.statics);

// OwnerSchema.pre('validate', function (next) {
//   // this might not be right to only allow one type, but let's run with it for now
//   if (this.runnable && this.github) {
//     next(Boom.badImplementation('should not have both a runnable user and github user'));
//   } else {
//     next();
//   }
// });
