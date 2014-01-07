express = require 'express'
mailchimp = require 'mailchimp'
domains = require '../domains'
Email = require('email').Email
configs = require '../configs'
_ = require 'lodash'
mailchimpApi = if configs.mailchimp? then new mailchimp.MailChimpAPI(configs.mailchimp.key)

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  if mailchimpApi?
    Object.keys(configs.mailchimp.lists).forEach (list) ->
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

  app.post "/request/improve", (req, res, next) ->
    requestEmailBody = "Improve Description: \n[\n\t" + req.body.description + "\n]\n\n" + "sender url: \n[\n\t" + req.body.url + "\n]"
    requestEmail = new Email(
      from: "newsuggestsions@runnable.com"
      to: "praful@runnable.com"
      cc: ["sundip@runnable.com", "yash@runnable.com"]
      subject: "New Improve Request"
      body: requestEmailBody
    )

    requestEmail.send (err) ->
      unless err
        res.json response: "thanks. Will get back to you soon."
      else
        console.error "ERROR sending new request mail", err
        res.json response: "Sorry. Will get back to you soon."