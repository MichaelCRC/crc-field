/**
 * CRC Buyers Guide PDF Generator
 * Uses PDFKit with full CRC brand standards
 * Run: node scripts/generateBuyersGuide.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'docs', 'CRC-Buyers-Guide.pdf');
const LOGO = path.join(process.env.HOME, 'vaults/crc-brain/active/brand/logos/active-v1/CRC_Primary_Badge.png');

// Brand colors
const NAVY = '#001A4D';
const TEAL = '#00B5CC';
const WHITE = '#FFFFFF';
const DARK = '#333333';
const LIGHT_BG = '#F8F9FA';

// Ensure output dir
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

const doc = new PDFDocument({ size: 'letter', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.pipe(fs.createWriteStream(OUTPUT));

const W = 612, H = 792;
const M = 54; // standard margin

function navyHeader(doc, text, y) {
  doc.rect(M, y, W - M*2, 28).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(WHITE).text(text, M + 12, y + 7, { width: W - M*2 - 24 });
  return y + 38;
}

function tealLine(doc, y) {
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(TEAL).lineWidth(2).stroke();
  return y + 8;
}

function bullet(doc, text, y, x = M + 20) {
  doc.font('Helvetica').fontSize(10).fillColor(DARK);
  doc.text('•', x - 12, y);
  doc.text(text, x, y, { width: W - M - x - 10 });
  return y + doc.heightOfString(text, { width: W - M - x - 10, font: 'Helvetica', fontSize: 10 }) + 4;
}

// ═══════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════
doc.rect(0, 0, W, H).fill(NAVY);

// Logo
if (fs.existsSync(LOGO)) {
  doc.image(LOGO, W/2 - 70, 120, { width: 140 });
}

// Title
doc.font('Helvetica-Bold').fontSize(32).fillColor(WHITE)
   .text('Your Home.', M, 320, { width: W - M*2, align: 'center' })
   .text('Your Investment.', M, 360, { width: W - M*2, align: 'center' })
   .text('Our Expertise.', M, 400, { width: W - M*2, align: 'center' });

// Teal accent
doc.moveTo(W/2 - 80, 450).lineTo(W/2 + 80, 450).strokeColor(TEAL).lineWidth(3).stroke();

doc.font('Helvetica').fontSize(16).fillColor(TEAL)
   .text('The Everyday Standard.', M, 470, { width: W - M*2, align: 'center' });

doc.font('Helvetica').fontSize(11).fillColor('#AAAACC')
   .text('Columbus Roofing Company', M, H - 80, { width: W - M*2, align: 'center' })
   .text('GAF Master Elite Contractor | License HIC-L00838', M, H - 64, { width: W - M*2, align: 'center' });

// ═══════════════════════════════════════
// PAGE 1 — WHO WE ARE
// ═══════════════════════════════════════
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });

let y = M;
doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY)
   .text('You Have One Roof.', M, y, { width: W - M*2 })
   .text('It Deserves One Standard.', M, y + 28, { width: W - M*2 });
y += 70;
y = tealLine(doc, y);

doc.font('Helvetica').fontSize(11).fillColor(DARK)
   .text('Columbus Roofing Company is not a roofing contractor. We are wealth protectors.', M, y, { width: W - M*2, lineGap: 4 });
y += 40;
doc.text('Your roof is not just shingles and nails — it is the shield over your family\'s greatest asset. We treat it that way.', M, y, { width: W - M*2, lineGap: 4 });
y += 50;
doc.text('Every decision we make — from the materials we select to the systems we follow — is designed to protect what matters most to you: your home, your equity, and your family\'s security.', M, y, { width: W - M*2, lineGap: 4 });
y += 60;

y = navyHeader(doc, 'WHY CRC IS DIFFERENT', y);

const creds = [
  'GAF Master Elite Contractor — Top 2% of roofers nationally',
  'GAF Contractor Number G09361',
  'Ohio License HIC-L00838',
  'HAAG Certified Inspection Protocol',
  'Foster the Future — giving back with every job',
  'Proprietary DCSI insurance claims system',
  'Columbus-based team — local accountability',
];
for (const c of creds) { y = bullet(doc, c, y); }

y += 15;
doc.font('Helvetica').fontSize(10).fillColor('#666')
   .text('[Photo: CRC team in branded gear at a completed roof installation]', M, y, { width: W - M*2, align: 'center' });

// Footer
doc.font('Helvetica').fontSize(8).fillColor('#999')
   .text('Columbus Roofing Company | The Everyday Standard', M, H - 30, { width: W - M*2, align: 'center' });

// ═══════════════════════════════════════
// PAGE 2 — TWO PATHS
// ═══════════════════════════════════════
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;

doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
   .text('Two Paths. One Standard.', M, y, { width: W - M*2, align: 'center' });
y += 35;
y = tealLine(doc, y);

const colW = (W - M*2 - 20) / 2;
const leftX = M, rightX = M + colW + 20;

// LEFT COLUMN — Insurance
doc.rect(leftX, y, colW, 24).fill(NAVY);
doc.font('Helvetica-Bold').fontSize(11).fillColor(WHITE)
   .text('INSURANCE CLAIMS', leftX + 10, y + 6, { width: colW - 20 });
let ly = y + 34;
doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY)
   .text('Your Carrier Works for Them.\nWe Work for You.', leftX, ly, { width: colW });
ly += 40;
doc.font('Helvetica').fontSize(9.5).fillColor(DARK)
   .text('We manage your entire insurance claim. From inspection to approval to installation. You pay your deductible. We handle everything else.', leftX, ly, { width: colW, lineGap: 3 });
ly += 55;
const insItems = ['HAAG certified inspection protocol', 'Xactimate scope preparation', 'Supplement negotiation', 'Adjuster meeting representation', 'Ohio matching law enforcement', 'Full carrier communication'];
for (const item of insItems) {
  doc.font('Helvetica').fontSize(9).fillColor(DARK).text('• ' + item, leftX + 5, ly, { width: colW - 10 });
  ly += 14;
}

// RIGHT COLUMN — Retail
doc.rect(rightX, y, colW, 24).fill(TEAL);
doc.font('Helvetica-Bold').fontSize(11).fillColor(WHITE)
   .text('RETAIL REPLACEMENT', rightX + 10, y + 6, { width: colW - 20 });
let ry = y + 34;
doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY)
   .text('When You Are Ready to Invest\nin Your Home.', rightX, ry, { width: colW });
ry += 40;
doc.font('Helvetica').fontSize(9.5).fillColor(DARK)
   .text('No insurance claim? No problem. We build the same premium product for homeowners who want to invest in their property the right way.', rightX, ry, { width: colW, lineGap: 3 });
ry += 55;
const retItems = ['Financing available — 0% options', 'Same GAF Master Elite quality', 'Same CRC process and warranty', 'Good / Better / Best options', 'Premium materials and installation', 'Full warranty protection'];
for (const item of retItems) {
  doc.font('Helvetica').fontSize(9).fillColor(DARK).text('• ' + item, rightX + 5, ry, { width: colW - 10 });
  ry += 14;
}

doc.font('Helvetica').fontSize(8).fillColor('#999')
   .text('Columbus Roofing Company | The Everyday Standard', M, H - 30, { width: W - M*2, align: 'center' });

// ═══════════════════════════════════════
// PAGE 3 — THREE PACKAGES
// ═══════════════════════════════════════
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;

doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
   .text('Our Roofing Systems', M, y, { width: W - M*2, align: 'center' });
y += 30;
y = tealLine(doc, y);

const pkgW = (W - M*2 - 24) / 3;
const packages = [
  { name: 'MINIMUM\nCOVERAGE', sub: 'Code Compliant Protection', color: '#666', items: ['GAF Timberline HDZ', 'Standard underlayment', 'Code minimum accessories', 'Limited Lifetime warranty', 'Professional installation'], badge: '' },
  { name: 'COLUMBUS\nSIGNATURE', sub: 'The CRC Standard', color: TEAL, items: ['GAF Timberline HDZ', 'Synthetic underlayment', 'Full accessory package', 'Ridge ventilation system', 'Golden Pledge available', 'WindProven eligible'], badge: 'MOST POPULAR' },
  { name: 'COLUMBUS\nSIGNATURE PRO', sub: 'The Premium Experience', color: NAVY, items: ['GAF Timberline UHDZ', 'Premium synthetic underlayment', 'Full premium accessories', 'Dual Shadow Line aesthetics', 'Maximum warranty protection', '30-year StainGuard Plus PRO'], badge: 'PREMIUM' },
];

packages.forEach((pkg, i) => {
  const px = M + i * (pkgW + 12);
  const py = y;
  
  // Card background
  doc.rect(px, py, pkgW, 320).fillAndStroke('#FAFAFA', '#E0E0E0');
  
  // Header
  doc.rect(px, py, pkgW, 50).fill(pkg.color);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(WHITE)
     .text(pkg.name, px + 8, py + 8, { width: pkgW - 16, align: 'center' });
  
  // Badge
  if (pkg.badge) {
    doc.rect(px + pkgW/2 - 35, py + 44, 70, 16).fill(pkg.badge === 'MOST POPULAR' ? TEAL : NAVY);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(WHITE)
       .text(pkg.badge, px + pkgW/2 - 33, py + 48, { width: 66, align: 'center' });
  }
  
  // Subtitle
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY)
     .text(pkg.sub, px + 8, py + 68, { width: pkgW - 16, align: 'center' });
  
  // Items
  let iy = py + 90;
  for (const item of pkg.items) {
    doc.font('Helvetica').fontSize(8.5).fillColor(DARK)
       .text('✓  ' + item, px + 10, iy, { width: pkgW - 20 });
    iy += 14;
  }
});

y += 340;
y = navyHeader(doc, 'UPGRADE ENHANCEMENTS', y);
const upgrades = ['Solar attic fans', 'Gutter guards', 'Attic insulation upgrade', 'Fascia and soffit replacement', 'Custom copper accents'];
let ux = M;
for (const u of upgrades) {
  doc.font('Helvetica').fontSize(9).fillColor(DARK).text('• ' + u, ux, y, { width: 160 });
  ux += 170;
  if (ux > W - M - 100) { ux = M; y += 14; }
}

doc.font('Helvetica').fontSize(8).fillColor('#999')
   .text('Columbus Roofing Company | The Everyday Standard', M, H - 30, { width: W - M*2, align: 'center' });

// ═══════════════════════════════════════
// PAGE 4 — OUR PROCESS
// ═══════════════════════════════════════
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;

doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
   .text('Our Process', M, y, { width: W - M*2, align: 'center' });
y += 30;
y = tealLine(doc, y);

const steps = [
  { num: '1', title: 'Free Inspection', desc: 'Comprehensive roof assessment using HAAG-certified protocol. We document everything.' },
  { num: '2', title: 'Storm Documentation', desc: 'If storm damage exists, we create a complete evidence package with photos, measurements, and test squares.' },
  { num: '3', title: 'Claim Filing Guidance', desc: 'We walk you through the claims process step by step. You are never alone in this.' },
  { num: '4', title: 'Adjuster Meeting', desc: 'CRC is present at your adjuster inspection. We ensure nothing gets missed.' },
  { num: '5', title: 'Scope Review & Supplement', desc: 'We review the carrier\'s estimate line by line and supplement for any missing items.' },
  { num: '6', title: 'Material Selection', desc: 'Choose your colors and system level. We show you options on your actual home.' },
  { num: '7', title: 'Installation Day', desc: 'Professional crew, CRC quality standards, full site protection and cleanup.' },
  { num: '8', title: 'Final Walkthrough & Warranty', desc: 'QC inspection, warranty registration, and your new roof is officially protected.' },
];

for (const step of steps) {
  // Number circle
  doc.circle(M + 18, y + 12, 14).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(WHITE)
     .text(step.num, M + 12, y + 5, { width: 12, align: 'center' });
  
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY)
     .text(step.title, M + 42, y + 2, { width: W - M*2 - 50 });
  doc.font('Helvetica').fontSize(9.5).fillColor(DARK)
     .text(step.desc, M + 42, y + 18, { width: W - M*2 - 50 });
  y += 48;
}

doc.font('Helvetica').fontSize(8).fillColor('#999')
   .text('Columbus Roofing Company | The Everyday Standard', M, H - 30, { width: W - M*2, align: 'center' });

// ═══════════════════════════════════════
// PAGE 5 — FINANCING
// ═══════════════════════════════════════
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;

doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY)
   .text('No Reason to Wait.', M, y, { width: W - M*2, align: 'center' })
   .text('No Reason to Worry.', M, y + 28, { width: W - M*2, align: 'center' });
y += 70;
y = tealLine(doc, y);

doc.font('Helvetica').fontSize(11).fillColor(DARK)
   .text('Protecting your home should never be delayed because of budget. That is why we offer flexible financing options designed to fit your financial situation.', M, y, { width: W - M*2, lineGap: 4 });
y += 50;

const finItems = [
  '0% financing options available on qualifying systems',
  'Monthly payment plans that fit your budget',
  'We work with all credit profiles',
  'Same-day approval in many cases',
  'No prepayment penalties',
  'Apply in minutes from your phone',
];
for (const item of finItems) { y = bullet(doc, item, y); y += 2; }

y += 30;
doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY)
   .text('Your home. Protected now.', M, y, { width: W - M*2, align: 'center' });

doc.font('Helvetica').fontSize(8).fillColor('#999')
   .text('Columbus Roofing Company | The Everyday Standard', M, H - 30, { width: W - M*2, align: 'center' });

// ═══════════════════════════════════════
// PAGE 6 — FOSTER THE FUTURE
// ═══════════════════════════════════════
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;

doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
   .text('Foster the Future', M, y, { width: W - M*2, align: 'center' });
y += 30;
y = tealLine(doc, y);

doc.font('Helvetica').fontSize(11).fillColor(DARK)
   .text('CRC believes that building roofs is only part of our responsibility. Building community is the rest.', M, y, { width: W - M*2, lineGap: 4 });
y += 40;
doc.text('Every job completed by Columbus Roofing Company contributes to Foster the Future — our commitment to giving back to the Columbus community.', M, y, { width: W - M*2, lineGap: 4 });
y += 50;

y = navyHeader(doc, 'HOW WE GIVE BACK', y);

const fosterItems = [
  'Roofs for families in need — partnering with local organizations to provide free roof replacements for families who cannot afford them',
  'Scholarships for Columbus students — investing in the next generation of leaders and builders',
  'Veteran housing support — priority service for military families',
  'Community storm response — rapid response for neighborhoods hit by severe weather',
];
for (const item of fosterItems) { y = bullet(doc, item, y); y += 4; }

y += 20;
doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY)
   .text('Building more than roofs.', M, y, { width: W - M*2, align: 'center' });

doc.font('Helvetica').fontSize(8).fillColor('#999')
   .text('Columbus Roofing Company | The Everyday Standard', M, H - 30, { width: W - M*2, align: 'center' });

// ═══════════════════════════════════════
// PAGE 7 — CONTACT
// ═══════════════════════════════════════
doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } });

doc.rect(0, 0, W, H).fill(NAVY);

if (fs.existsSync(LOGO)) {
  doc.image(LOGO, W/2 - 60, 140, { width: 120 });
}

doc.font('Helvetica-Bold').fontSize(24).fillColor(WHITE)
   .text('Ready to protect', M, 320, { width: W - M*2, align: 'center' })
   .text('your home?', M, 352, { width: W - M*2, align: 'center' });

doc.moveTo(W/2 - 60, 395).lineTo(W/2 + 60, 395).strokeColor(TEAL).lineWidth(3).stroke();

doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL)
   .text('', M, 420, { width: W - M*2, align: 'center' });

doc.font('Helvetica').fontSize(13).fillColor(WHITE)
   .text('claims@columbusroofingco.com', M, 455, { width: W - M*2, align: 'center' })
   .text('columbusroofingco.com', M, 478, { width: W - M*2, align: 'center' });

doc.font('Helvetica').fontSize(14).fillColor(TEAL)
   .text('"The Everyday Standard."', M, 530, { width: W - M*2, align: 'center' });

doc.font('Helvetica').fontSize(10).fillColor('#8888AA')
   .text('5131 Post Rd, Dublin OH 43017', M, H - 70, { width: W - M*2, align: 'center' })
   .text('GAF Master Elite Contractor | License HIC-L00838', M, H - 54, { width: W - M*2, align: 'center' });

doc.end();
console.log(`Buyers Guide generated: ${OUTPUT}`);
