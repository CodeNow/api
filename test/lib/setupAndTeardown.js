var db = require('./db');
// BEFORE ALL
db.onceConnected(db.dropCollection);
// AFTER ALL
process.on('exit', db.dropDatabase);