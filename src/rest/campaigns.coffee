express = require 'express'
mailchimp = require 'mailchimp'
domains = require '../domains'
configs = require '../configs'
_ = require 'lodash'

mailchimpApi = if configs.mailchimp? then new mailchimp.MailChimpAPI(configs.mailchimp.key);

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  if mailchimpApi?
    Object.keys(configs.mailchimp.lists).forEach (list) ->
      console.log("1337SUNDIPPRAFUL starting post route for /campaigns", list)
      app.post '/campaigns/'+list, (req, res) ->
        opts =
          id : configs.mailchimp.lists[list]
          email_address: req.body.EMAIL
          merge_vars   : req.body
          send_welcome    : false
          update_existing : false
          double_optin    : false

        mailchimpApi.listSubscribe opts, (err) ->
          if err then res.json 400, message:err.message else
            res.json 201, req.body
