const crypto = require('node:crypto');

function createId(prefix) {
  const time = Date.now().toString(36).padStart(9, '0');
  return `${prefix}_${time}${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = { createId };