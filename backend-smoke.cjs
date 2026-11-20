const assert = require('node:assert/strict');
const platform = require('./platform.cjs');
assert.equal(typeof platform.requestId,'function');
assert.equal(typeof platform.idempotency,'function');
assert.equal(typeof require('./booking-engine.cjs').quote,'function');
assert.equal(typeof require('./operations-auth.cjs').requirePermission,'function');
console.log('Backend module smoke checks passed.');
