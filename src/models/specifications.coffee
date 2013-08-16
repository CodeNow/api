async = require 'async'
configs = require '../configs'
error = require '../error'
mongoose = require 'mongoose'
_ = require 'lodash'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

specificationSchema = new Schema
  name:
    type:String
    index: true
    unique: true
  description:
    type: String
  instructions:
    type: String
  requirements:
    type: [String]
    default: [ ]


module.exports = mongoose.model 'Specifications', specificationSchema