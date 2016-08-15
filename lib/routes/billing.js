'use strict'

var express = require('express')
var app = module.exports = express()


app.get('/billing/:orgId/payment-method',
  function (req, res) {
    res.json({
      user: {
        githubId: 1234,
        githubUsername: 'Myztiq'
      },
      card: {
        "id": "card_18etI6LYrJgOrBWzRV7CXeEG",
        "object": "card",
        "address_city": null,
        "address_country": null,
        "address_line1": null,
        "address_line1_check": null,
        "address_line2": null,
        "address_state": null,
        "address_zip": "12312",
        "address_zip_check": "unchecked",
        "brand": "Visa",
        "country": "US",
        "customer": "cus_8wuxvO3sgpYTez",
        "cvc_check": "unchecked",
        "dynamic_last4": null,
        "exp_month": 12,
        "exp_year": 2031,
        "funding": "credit",
        "last4": "4242",
        "metadata": {
        },
        "name": null,
        "tokenization_method": null
      }
    })
  })

app.post('/billing/:orgId/payment-method',
  function (req, res) {
    res.json({})
  })

app.get('/billing/:orgId/invoices',
  function (req, res) {
    res.json([
      {
        "id": "in_18f0k4LYrJgOrBWzZu4xu10K",
        "object": "invoice",
        "amount_due": 0,
        "application_fee": null,
        "attempt_count": 0,
        "attempted": true,
        "charge": null,
        "closed": true,
        "currency": "usd",
        "customer": "cus_8wuxvO3sgpYTez",
        "date": 1470374372,
        "description": null,
        "discount": null,
        "ending_balance": 0,
        "forgiven": false,
        "lines": {
          "data": [
            {
              "id": "sub_8wuZF1YRQ33rnH",
              "object": "line_item",
              "amount": 0,
              "currency": "usd",
              "description": null,
              "discountable": true,
              "livemode": true,
              "metadata": {
                "users": "[1981198,\"ADDED_USER_TO_MEET_MINIMUM\",\"ADDED_USER_TO_MEET_MINIMUM\"]"
              },
              "period": {
                "start": 1470374372,
                "end": 1471583972
              },
              "plan": {
                "id": "runnable-basic",
                "object": "plan",
                "amount": 900,
                "created": 1470016403,
                "currency": "usd",
                "interval": "month",
                "interval_count": 1,
                "livemode": false,
                "metadata": {},
                "name": "Basic",
                "statement_descriptor": "Single User - BASIC",
                "trial_period_days": 14
              },
              "proration": false,
              "quantity": 1,
              "subscription": null,
              "type": "subscription"
            }
          ],
          "total_count": 1,
          "object": "list",
          "url": "/v1/invoices/in_18f0k4LYrJgOrBWzZu4xu10K/lines"
        },
        "livemode": false,
        "metadata": {
          "paidBy": "Myztiq"
        },
        "next_payment_attempt": null,
        "paid": true,
        "period_end": 1470374372,
        "period_start": 1470374372,
        "receipt_number": null,
        "starting_balance": 0,
        "statement_descriptor": null,
        "subscription": "sub_8wuZF1YRQ33rnH",
        "subtotal": 0,
        "tax": null,
        "tax_percent": null,
        "total": 900,
        "webhooks_delivered_at": 1470374372
      }
    ])
  }
);


app.get('/billing/:orgId/plan',
  function (req, res) {
    res.json({
      current: {
        plan: {
          id: 'basic',
          maxConfigurations: 2,
          price: 9,
          userCount: 5
        }
      },
      next: {
        plan: {
          id: 'standard',
          maxConfigurations: 7,
          price: 29,
          userCount: 5
        }
      }
    })
  }
);
