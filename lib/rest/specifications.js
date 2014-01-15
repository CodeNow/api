var configs = require('../configs');
var specifications = require('../models/specifications');
var error = require('../error');
var express = require('express');
var app = module.exports = express();
app.post('/specifications', function (req, res) {
  specifications.createSpecification(req.domain, {
    userId: req.user_id,
    name: req.body.name,
    description: req.body.description,
    instructions: req.body.instructions,
    requirements: req.body.requirements
  }, function (err, specification) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(201, specification);
    }
  });
});
app.get('/specifications', function (req, res) {
  specifications.listSpecifications(req.domain, function (err, specifications) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(specifications);
    }
  });
});
app.get('/specifications/:id', function (req, res) {
  specifications.getSpecification(req.domain, req.params.id, function (err, specification) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(specification);
    }
  });
});
app.put('/specifications/:id', function (req, res) {
  specifications.updateSpecification(req.domain, {
    userId: req.user_id,
    specificationId: req.params.id,
    name: req.body.name,
    description: req.body.description,
    instructions: req.body.instructions,
    requirements: req.body.requirements
  }, function (err, specification) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(specification);
    }
  });
});
app.del('/specifications/:id', function (req, res) {
  specifications.deleteSpecification(req.domain, {
    userId: req.user_id,
    specificationId: req.params.id
  }, function (err) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json({ message: 'specification deleted' });
    }
  });
});