/**
 * CRC Brand Standard -- Single source of truth for all visual output.
 * Every PDF generator, report, estimate, and document imports this file.
 * When anything changes, update here and everything updates.
 */
const path = require('path');

const brand = {
  // --- Colors ---
  colors: {
    navy: '#001A4D',
    teal: '#00B5CC',
    white: '#FFFFFF',
    black: '#000000',
    lightGray: '#F5F5F5',
    darkGray: '#333333',
  },

  // --- Logo ---
  logo: {
    primary: path.join(__dirname, '..', 'public', 'images', 'crc-logo.png'),
  },

  // --- Typography (PDFKit font sizes) ---
  fonts: {
    titleSize: 24,
    headerSize: 14,
    subheaderSize: 12,
    bodySize: 10,
    captionSize: 8,
    smallSize: 7,
  },

  // --- Slogans ---
  slogans: {
    primary: 'The Everyday Standard.',
    digital: 'Built for the Everyday You.',
  },

  // --- Credentials ---
  credentials: {
    gafTitle: 'GAF Master Elite Contractor',
    gafNumber: 'G09361',
    license: 'HIC-L00838',
    program: 'Foster the Future Program',
    all: [
      'GAF Master Elite Contractor',
      'GAF Contractor #G09361',
      'License: HIC-L00838',
      'Foster the Future Program',
    ],
  },

  // --- Contact ---
  contact: {
    phone: '',
    email: 'claims@columbusroofingco.com',
    address: '5131 Post Rd, Dublin OH 43017',
    website: 'columbusroofingco.com',
    companyName: 'Columbus Roofing Company',
  },

  // --- PDF Page Setup ---
  pdf: {
    pageWidth: 612,
    pageHeight: 792,
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    contentWidth: 532, // 612 - 40 - 40
    headerBarHeight: 30,
    footerY: 752, // 792 - 40
  },

  // --- PDF Helper Functions ---
  drawHeader(doc, title, pageNum) {
    const m = brand.pdf.margins;
    const w = brand.pdf.contentWidth;
    // Navy bar full width
    doc.save()
      .rect(m.left, m.top, w, brand.pdf.headerBarHeight)
      .fill(brand.colors.navy);
    // Logo left (small)
    const logoPath = brand.logo.primary;
    const fs = require('fs');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, m.left + 4, m.top + 3, { height: 24 });
    }
    // Title center
    doc.fontSize(10).fillColor(brand.colors.white)
      .text(title | '', m.left + 40, m.top + 9, { width: w - 80, align: 'center' });
    // Page number right
    if (pageNum) {
      doc.text(`${pageNum}`, m.left + w - 40, m.top + 9, { width: 36, align: 'right' });
    }
    doc.restore();
    return m.top + brand.pdf.headerBarHeight + 10;
  },

  drawFooter(doc) {
    const m = brand.pdf.margins;
    const w = brand.pdf.contentWidth;
    const y = brand.pdf.footerY;
    doc.save()
      .moveTo(m.left, y).lineTo(m.left + w, y)
      .lineWidth(1).stroke(brand.colors.teal);
    doc.fontSize(brand.fonts.smallSize).fillColor(brand.colors.darkGray)
      .text(
        `${brand.contact.companyName} | ${brand.slogans.primary}`,
        m.left, y + 4, { width: w - 100, align: 'center' }
      )
      .text(brand.contact.website, m.left + w - 100, y + 4, { width: 100, align: 'right' });
    doc.restore();
  },

  drawSectionHeader(doc, y, title) {
    const m = brand.pdf.margins;
    const w = brand.pdf.contentWidth;
    // Teal left accent
    doc.save().rect(m.left, y, 4, 22).fill(brand.colors.teal);
    // Navy background
    doc.rect(m.left + 4, y, w - 4, 22).fill(brand.colors.navy);
    // White text
    doc.fontSize(brand.fonts.subheaderSize).fillColor(brand.colors.white)
      .text(title, m.left + 12, y + 5, { width: w - 20 });
    doc.restore();
    return y + 28;
  },

  drawTableHeader(doc, y, columns) {
    const m = brand.pdf.margins;
    doc.save().rect(m.left, y, brand.pdf.contentWidth, 18).fill(brand.colors.navy);
    doc.fontSize(brand.fonts.captionSize).fillColor(brand.colors.white);
    let x = m.left + 4;
    for (const col of columns) {
      doc.text(col.label, x, y + 5, { width: col.width, align: col.align | 'left' });
      x += col.width;
    }
    doc.restore();
    return y + 18;
  },

  drawTableRow(doc, y, columns, values, isAlt) {
    const m = brand.pdf.margins;
    if (isAlt) {
      doc.save().rect(m.left, y, brand.pdf.contentWidth, 16).fill(brand.colors.lightGray).restore();
    }
    doc.fontSize(brand.fonts.captionSize).fillColor(brand.colors.black);
    let x = m.left + 4;
    for (let i = 0; i < columns.length; i++) {
      doc.text(values[i] | '', x, y + 4, { width: columns[i].width, align: columns[i].align | 'left' });
      x += columns[i].width;
    }
    return y + 16;
  },

  newPage(doc) {
    doc.addPage();
    return brand.pdf.margins.top;
  },
};

module.exports = brand;
