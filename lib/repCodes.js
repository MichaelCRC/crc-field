/** Rep code management */
const { read, write } = require('./store');

const FILE = 'rep-codes.json';
const DEFAULT = {
  codes: [
    { code: 'MCG', name: 'Michael McGovern', role: 'admin', active: true, phone: '614-547-7462', email: 'michael@columbusroofingco.com', photo_url: '', createdAt: '2026-04-01' },
    { code: 'LANE', name: 'Lane Campbell', role: 'admin', active: true, phone: '', email: 'lane@columbusroofingco.com', photo_url: '', createdAt: '2026-04-01' },
    { code: 'TSHINGLE', name: 'Tom Davidson', role: 'rep', active: true, phone: '', email: '', photo_url: '', createdAt: '2026-04-01' },
    { code: 'RHYSB', name: 'Rhys Bennett', role: 'rep', active: true, phone: '', email: '', photo_url: '', createdAt: '2026-04-01' },
    { code: 'DCHRIS', name: 'Donny Christiansen', role: 'rep', active: true, phone: '', email: '', photo_url: '', createdAt: '2026-04-01' },
    { code: 'RONDO', name: 'Nick Rondon', role: 'rep', active: true, phone: '', email: '', photo_url: '', createdAt: '2026-04-01' },
    { code: 'DOMG', name: 'Dom G', role: 'rep', active: true, phone: '', email: '', photo_url: '', createdAt: '2026-04-01' },
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
