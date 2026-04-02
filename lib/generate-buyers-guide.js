/**
 * Generate CRC Buyer's Guide PDF
 * Wrapper that calls the Python reportlab script
 * 
 * Usage: node lib/generate-buyers-guide.js
 */

const { execSync } = require('child_process');
const path = require('path');

const PYTHON = path.join(process.env.HOME, 'content-engine/venv/bin/python3');
const SCRIPT = path.join(process.env.HOME, 'content-engine/buyers_guide_pdf.py');

try {
  console.log('Generating CRC Buyer\'s Guide PDF...');
  execSync(`${PYTHON} ${SCRIPT}`, { stdio: 'inherit' });
  console.log('Done.');
} catch (err) {
  console.error('Failed to generate PDF:', err.message);
  process.exit(1);
}
