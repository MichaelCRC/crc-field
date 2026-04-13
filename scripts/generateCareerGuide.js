/**
 * CRC Sales Career Guide PDF Generator
 * NLP-embedded manifesto for recruiting
 * Run: node scripts/generateCareerGuide.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'docs', 'CRC-Sales-Career-Guide.pdf');
const LOGO = path.join(process.env.HOME, 'vaults/crc-brain/active/brand/logos/active-v1/CRC_Primary_Badge.png');

const NAVY = '#001A4D';
const TEAL = '#00B5CC';
const WHITE = '#FFFFFF';
const DARK = '#333333';

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const doc = new PDFDocument({ size: 'letter', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.pipe(fs.createWriteStream(OUTPUT));
const W = 612, H = 792, M = 54;

function tealLine(doc, y) { doc.moveTo(M, y).lineTo(W-M, y).strokeColor(TEAL).lineWidth(2).stroke(); return y+8; }
function footer(doc) { doc.font('Helvetica').fontSize(8).fillColor('#999').text('Columbus Roofing Company | The Everyday Standard', M, H-30, { width: W-M*2, align: 'center' }); }
function bodyText(doc, text, y) {
  doc.font('Helvetica').fontSize(11).fillColor(DARK).text(text, M, y, { width: W-M*2, lineGap: 5 });
  return y + doc.heightOfString(text, { width: W-M*2, font: 'Helvetica', fontSize: 11, lineGap: 5 }) + 12;
}

// ═══ COVER ═══
doc.rect(0, 0, W, H).fill(NAVY);
if (fs.existsSync(LOGO)) doc.image(LOGO, W/2-60, 100, { width: 120 });
doc.font('Helvetica-Bold').fontSize(36).fillColor(WHITE)
   .text('You Were Not', M, 300, { width: W-M*2, align: 'center' })
   .text('Built for Average.', M, 344, { width: W-M*2, align: 'center' });
doc.moveTo(W/2-80, 400).lineTo(W/2+80, 400).strokeColor(TEAL).lineWidth(3).stroke();
doc.font('Helvetica').fontSize(14).fillColor(TEAL)
   .text('Join the Team That Proves It.', M, 420, { width: W-M*2, align: 'center' });
doc.font('Helvetica').fontSize(13).fillColor('#8888AA')
   .text('"The Everyday Standard."', M, 460, { width: W-M*2, align: 'center' });
doc.font('Helvetica').fontSize(10).fillColor('#666688')
   .text('Columbus Roofing Company', M, H-60, { width: W-M*2, align: 'center' });

// ═══ PAGE 1 — THE SUSPICION ═══
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
let y = M;
doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY)
   .text('You Already Know You Are', M, y).text('Capable of More.', M, y+28);
y += 65; y = tealLine(doc, y);

y = bodyText(doc, 'You have felt it. That quiet voice that says the job you are in was never meant to be your destination. The ceiling that was not supposed to exist. The paycheck that does not reflect what you are actually worth.', y);
y = bodyText(doc, 'You are not wrong.', y);
y = bodyText(doc, 'Columbus Roofing Company was built for people like you. People who are done settling. People who are ready to bet on themselves — with a team behind them that bets on them too.', y);
y = bodyText(doc, 'This is not a roofing job.', y);
y = bodyText(doc, 'This is a vehicle for building the life you have always known you deserved.', y);

y += 20;
doc.font('Helvetica-Bold').fontSize(13).fillColor(TEAL)
   .text('The money is already sitting on roofs.\nThe variable is you.', M, y, { width: W-M*2, align: 'center' });
footer(doc);

// ═══ PAGE 2 — THE FEAR ═══
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;
doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY).text('No Experience? Good.', M, y);
y += 35; y = tealLine(doc, y);

y = bodyText(doc, 'The biggest lie in sales is that you need experience to succeed. What you need is coachability, work ethic, and the hunger to be great.', y);
y = bodyText(doc, 'We have trained former teachers, veterans, athletes, bartenders, and factory workers into six-figure earners. Not because they knew roofing. Because they knew how to show up.', y);
y = bodyText(doc, 'We do not hire resumes. We hire people.', y);

y += 10;
doc.rect(M, y, W-M*2, 28).fill(NAVY);
doc.font('Helvetica-Bold').fontSize(12).fillColor(WHITE).text('WHAT WE LOOK FOR', M+12, y+7);
y += 38;

const traits = ['All-In Attitude', 'Impact Obsessed', 'Ruthless Innovation', 'Extreme Ownership', 'Relentless Resilience'];
for (const t of traits) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TEAL).text('■  ', M+10, y);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(t, M+28, y);
  y += 18;
}
y += 15;
y = bodyText(doc, 'If you have these — we will teach you everything else.', y);
footer(doc);

// ═══ PAGE 3 — THE DREAM ═══
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;
doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
   .text('Here Is What Your Life', M, y).text('Looks Like in 12 Months.', M, y+26);
y += 60; y = tealLine(doc, y);

const earnings = [
  ['Commission Rate', '10-12% per job'],
  ['Average Job Value', '$15,000 — $25,000'],
  ['First Year Realistic', '$75,000 — $120,000'],
  ['Top Performers', '$150,000 — $250,000+'],
];
for (const [label, val] of earnings) {
  doc.font('Helvetica').fontSize(10).fillColor('#666').text(label, M, y, { width: 160 });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(val, M+165, y-1);
  y += 22;
}

y += 15;
y = bodyText(doc, 'But this is not about the money.', y);
y = bodyText(doc, 'This is about what the money means.', y);
y = bodyText(doc, 'The vacation you stopped planning. The neighborhood you told yourself someday. The conversation with your kids where you show them what it looks like to go all in.', y);
y = bodyText(doc, 'We are building something here. Not just a company. A dynasty.', y);

y += 10;
doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('THE MATH', M, y);
y += 18;
doc.font('Helvetica').fontSize(10).fillColor(DARK)
   .text('Annual Target: $2,000,000 Revenue / $200,000 Commission', M, y); y += 16;
doc.text('Monthly: $166,666 Revenue / $16,666 Commission', M, y); y += 16;
doc.text('Weekly (48 weeks): $41,666 Revenue / $4,166 Commission', M, y); y += 16;
doc.text('Daily: $8,333 Revenue / $833 Commission', M, y); y += 16;
doc.text('100 jobs/year → 2 contracts/week → 8 conversations/day', M, y);
footer(doc);

// ═══ PAGE 4 — MILESTONES ═══
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;
doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
   .text('Earn It. Prove It.', M, y).text('Get Rewarded Heavily.', M, y+26);
y += 60; y = tealLine(doc, y);

const milestones = [
  { level: '$1,000,000 in Sales', rewards: ['Custom CRC suit', 'Your name in the building', 'Recognition at the annual event'] },
  { level: '$2,500,000 in Sales', rewards: ['CRC Blue Face Rolex', 'A moment that changes how you see yourself'] },
  { level: 'Top 2 Reps Annually', rewards: ['All-inclusive trip — you and a guest'] },
  { level: 'Year-End Top Performers', rewards: ['All-inclusive trip — fully paid'] },
];

for (const ms of milestones) {
  doc.rect(M, y, W-M*2, 22).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEAL).text(ms.level, M+10, y+5);
  y += 30;
  for (const r of ms.rewards) {
    doc.font('Helvetica').fontSize(10).fillColor(DARK).text('→  ' + r, M+15, y);
    y += 16;
  }
  y += 10;
}
footer(doc);

// ═══ PAGE 5 — THE MISSION ═══
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;
doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY)
   .text('We Are Not Building', M, y).text('a Roofing Company.', M, y+24)
   .text('We Are Building a Dynasty.', M, y+48);
y += 80; y = tealLine(doc, y);

y = bodyText(doc, '$100M+ in Ohio by 2029. Columbus as the hub. Satellite offices in Cleveland, Cincinnati, Dayton, Toledo, and Akron.', y);
y = bodyText(doc, 'CRC University — the OSU of roofing. A 10,000+ sq ft training center, gym, cafeteria, podcast studio, and culture hub. Masterminds. Business leaders. Athletes. The Mecca of business in the Midwest.', y);
y = bodyText(doc, 'Mentioned alongside the Columbus Blue Jackets, Columbus Crew, Columbus Clippers — Columbus Roofing Company as a true Columbus institution.', y);
y = bodyText(doc, '$1M+ given back annually. Foster the Future as a household name. Building roofs and opportunities for the less fortunate.', y);
y = bodyText(doc, 'We recruit ex-athletes, military veterans, and high achievers because we know what it takes to be part of something bigger than yourself.', y);

y += 10;
doc.font('Helvetica-Bold').fontSize(13).fillColor(TEAL)
   .text('Roofing is the vehicle.\nWealth creation is the destination.\nLegacy is the point.', M, y, { width: W-M*2, align: 'center', lineGap: 4 });
footer(doc);

// ═══ PAGE 6 — TRAINING ═══
doc.addPage({ margins: { top: M, bottom: M, left: M, right: M } });
y = M;
doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
   .text('You Will Not Figure', M, y).text('This Out Alone.', M, y+26)
   .text('That Is the Point.', M, y+52);
y += 80; y = tealLine(doc, y);

y = bodyText(doc, 'Every person who joins CRC enters a system designed to make them succeed. Not eventually. From day one.', y);

doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('DCSI — Decision Clarity System for Insurance', M, y);
y += 16;
y = bodyText(doc, 'The most sophisticated insurance sales system in the roofing industry. Proprietary. Built on 20 years of field experience. You will learn it in 30 days. You will master it in 90.', y);

const weeks = [
  'Week 1: CRC doctrine, brand, and culture',
  'Week 2: Product knowledge and inspection',
  'Week 3: The DCSI system — insurance sales',
  'Week 4: Live calls, ride-alongs, first deals',
];
for (const w of weeks) { doc.font('Helvetica').fontSize(10).fillColor(DARK).text('→  '+w, M+10, y); y+=16; }
y += 10;

doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('ONGOING:', M, y); y += 16;
const ongoing = ['Daily coaching calls', 'Weekly team training', 'Monthly masterminds', 'Quarterly HQ events', 'Access to CRC Brain — AI advisor in your pocket'];
for (const o of ongoing) { doc.font('Helvetica').fontSize(10).fillColor(DARK).text('•  '+o, M+10, y); y+=15; }
y += 10;
y = bodyText(doc, 'You will never walk into a house alone without knowing exactly what to say.', y);
doc.font('Helvetica').fontSize(10).fillColor(TEAL).text('Future equity opportunity for top performers.', M, y);
footer(doc);

// ═══ PAGE 7 — THE CALL ═══
doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } });
doc.rect(0, 0, W, H).fill(NAVY);
if (fs.existsSync(LOGO)) doc.image(LOGO, W/2-50, 80, { width: 100 });

doc.font('Helvetica-Bold').fontSize(24).fillColor(WHITE)
   .text('The Only Question Is', M, 240, { width: W-M*2, align: 'center' })
   .text('Whether You Are Ready.', M, 272, { width: W-M*2, align: 'center' });

doc.moveTo(W/2-80, 315).lineTo(W/2+80, 315).strokeColor(TEAL).lineWidth(3).stroke();

doc.font('Helvetica').fontSize(11).fillColor('#CCCCDD')
   .text('Most people will read this and do nothing. They will go back to the job that is slowly convincing them that this is as good as it gets.', M+40, 340, { width: W-M*2-80, align: 'center', lineGap: 4 });

doc.font('Helvetica-Bold').fontSize(12).fillColor(WHITE)
   .text('You are not most people.', M, 410, { width: W-M*2, align: 'center' });

doc.font('Helvetica').fontSize(11).fillColor('#CCCCDD')
   .text('The people on this team did not wait for the perfect moment. They created it. They showed up. They did the work. They changed their lives.', M+40, 440, { width: W-M*2-80, align: 'center', lineGap: 4 });

doc.font('Helvetica-Bold').fontSize(13).fillColor(TEAL)
   .text('The door is open.', M, 510, { width: W-M*2, align: 'center' });

doc.font('Helvetica-Bold').fontSize(16).fillColor(WHITE)
   .text('Apply: crc-field.onrender.com/recruit', M, 550, { width: W-M*2, align: 'center' });
doc.font('Helvetica').fontSize(14).fillColor(TEAL)
   .text('', M, 580, { width: W-M*2, align: 'center' });

doc.font('Helvetica-Bold').fontSize(15).fillColor(WHITE)
   .text('"You Were Not Built for Average."', M, 640, { width: W-M*2, align: 'center' });
doc.font('Helvetica').fontSize(12).fillColor(TEAL)
   .text('"The Everyday Standard."', M, 662, { width: W-M*2, align: 'center' });

doc.font('Helvetica').fontSize(9).fillColor('#666688')
   .text('Columbus Roofing Company | 5131 Post Rd, Dublin OH 43017 | License HIC-L00838', M, H-40, { width: W-M*2, align: 'center' });

doc.end();
console.log(`Career Guide generated: ${OUTPUT}`);
