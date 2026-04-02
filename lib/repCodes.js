/** Rep code management */
const { read, write } = require('./store');

const FILE = 'rep-codes.json';
const DEFAULT = {
  codes: [
    { code: 'MCG', name: 'Michael McGovern', role: 'admin', active: true, createdAt: '2026-04-01T00:00:00Z' },
    { code: 'LANE', name: 'Lane Campbell', role: 'admin', active: true, createdAt: '2026-04-01T00:00:00Z' },
  ]
};

function listRepCodes() {
  return read(FILE, DEFAULT).codes;
}

function validateRepCode(code) {
  const codes = listRepCodes();
  const rep = codes.find(r => r.code === code.toUpperCase() && r.active);
  return rep || null;
}

function isAdmin(code) {
  const rep = validateRepCode(code);
  return rep && rep.role === 'admin';
}

module.exports = { listRepCodes, validateRepCode, isAdmin };
