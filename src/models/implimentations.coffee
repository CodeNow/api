async = require 'async'
configs = require '../configs'
error = require '../error'
mongoose = require 'mongoose'
_ = require 'lodash'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

implimentationSchema = new Schema
  url:
    type:String
    index: true
    unique: true
  requirements:
    type: [
      name: String
      value: String
    ]
    default: [ ]


module.exports = mongoose.model 'Implimentation', implimentationSchema