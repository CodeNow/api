var db = require('./db');
// BEFORE ALL

// AFTER ALL
process.on('exit', db.dropDatabase);