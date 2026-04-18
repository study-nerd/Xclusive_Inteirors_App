const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const toDataUrl = (imageUrl) => {
  if (!imageUrl) return null;
  const rel = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
  const abs = path.join(__dirname, '..', rel);
  if (!fs.existsSync(abs)) return null;
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buf = fs.readFileSync(abs);
  return `data:${mime};base64,${buf.toString('base64')}`;
};

const generatePOPdf = async (po) => {
  const outputDir = path.join(__dirname, '../uploads/po-pdfs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // FIX: PO number contains "/" which breaks filenames — sanitise it
  const safeFilename = po.po_number.replace(/\//g, '-');
  const outputPath = path.join(outputDir, `${safeFilename}.pdf`);

  const html = buildPOHtml(po);

  const browser = await puppeteer.launch({
    headless: true,   // FIX: 'new' flag unsupported on Alpine Chromium — use true
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',   // FIX: prevents crashes in Docker
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
  } finally {
    await browser.close();
  }

  return outputPath;
};

const buildPOHtml = (po) => {
  const company = {
    name:    process.env.COMPANY_NAME    || 'Xclusive Interiors Pvt. Ltd.',
    address: process.env.COMPANY_ADDRESS || '208, Vision Galleria, Near Kunal Icon, Pimple Saudagar, Pune 411027',
    gstin:   process.env.COMPANY_GSTIN   || '27AAACX1884C1ZD',
  };

  const categoryTotals = {};
  for (const item of po.line_items || []) {
    const cat = item.category_name || 'Other';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(item.total || 0);
  }

  const lineItemsHtml = (po.line_items || []).map((item, i) => {
    const imageTags = (item.images || [])
      .map(img => {
        const src = toDataUrl(img.image_url);
        return src ? `<img src="${src}" />` : '';
      })
      .filter(Boolean)
      .join('');

    const imagesRow = imageTags ? `
      <tr class="item-images">
        <td></td>
        <td colspan="9">
          <div class="image-grid">${imageTags}</div>
        </td>
      </tr>` : '';

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${item.item_name || ''}</td>
        <td>${item.description || ''}</td>
        <td>${item.category_name || ''}</td>
        <td>${item.unit || ''}</td>
        <td>${parseFloat(item.quantity || 0).toFixed(2)}</td>
        <td>${parseFloat(item.rate || 0).toFixed(2)}</td>
        <td>${item.brand_make || ''}</td>
        <td>${parseFloat(item.gst_percent || 0).toFixed(0)}%</td>
        <td>${parseFloat(item.total || 0).toFixed(2)}</td>
      </tr>${imagesRow}`;
  }).join('');

  const categorySummaryHtml = Object.entries(categoryTotals).map(([cat, amt], i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${cat}</td>
      <td style="text-align:right">${parseFloat(amt).toFixed(2)}</td>
    </tr>`).join('');

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
  .page { padding: 10mm; }
  h1 { font-size: 20px; font-weight: bold; text-align: right; }
  .po-num { font-size: 13px; text-align: right; }
  .date { font-size: 11px; text-align: right; }
  .header-row { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
  .logo { font-size: 18px; font-weight: bold; letter-spacing: 2px; }
  .logo small { display:block; font-size: 9px; font-weight: normal; letter-spacing: 1px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #ccc; margin-bottom: 10px; }
  .info-cell { padding: 6px 8px; border: 1px solid #ccc; }
  .info-cell strong { display: block; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #1a1a1a; color: #fff; padding: 5px 4px; text-align: left; font-size: 9px; }
  td { padding: 4px; border-bottom: 1px solid #eee; font-size: 9px; }
  .totals-row td { border: none; font-weight: bold; }
  .footer { margin-top: 20px; display: flex; justify-content: space-between; }
  .poc-box { border: 1px solid #ccc; padding: 6px 10px; font-size: 9px; }
  .terms { margin-top: 10px; font-size: 9px; }
  .sign { text-align: right; margin-top: 30px; font-size: 9px; }
  .page-break { page-break-before: always; }
  .item-images { page-break-inside: avoid; }
  .image-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .image-grid img { width: 100%; max-height: 70px; object-fit: cover; border: 1px solid #ddd; }
</style>
</head>
<body>

<div class="page">
  <div class="header-row">
    <div class="logo">XCLUSIVE<br/><small>INTERIORS / ARCHITECTURE</small></div>
    <div>
      <h1>Purchase Order</h1>
      <div class="po-num">${po.po_number}</div>
      <div class="date">Date: ${fmt(po.created_at)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-cell">
      <strong>Bill to:</strong> ${company.name}<br/>${company.address}<br/><br/>
      <strong>GSTIN:</strong> ${company.gstin}<br/><br/>
      <strong>Project Name:</strong> ${po.project_name} (${po.project_code})<br/><br/>
      <strong>Ship to:</strong> ${po.site_address || ''}<br/><br/>
      <strong>Work start date:</strong> ${fmt(po.work_start_date)}<br/>
      <strong>Work end date:</strong> ${fmt(po.work_end_date)}
    </div>
    <div class="info-cell">
      <strong>Vendor Details:</strong> ${po.vendor_name}<br/>
      <strong>GST:</strong> ${po.vendor_gstin || ''}<br/>
      <strong>Pan:</strong> ${po.vendor_pan || ''}<br/><br/>
      <strong>Address:</strong> ${po.vendor_address || ''}<br/><br/>
      <strong>Phone number:</strong> ${po.vendor_phone || ''}<br/><br/>
      <strong>Bank Details:</strong><br/>
      Account Holder Name - ${po.vendor_bank_account_holder || ''}<br/>
      Account Number - ${po.vendor_bank_account_number || ''}<br/>
      IFSC Code - ${po.vendor_bank_ifsc || ''}<br/>
      Bank Name - ${po.vendor_bank_name || ''}
    </div>
  </div>

  <table>
    <thead><tr><th>S.No.</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${categorySummaryHtml}</tbody>
    <tfoot>
      <tr class="totals-row"><td colspan="2" style="text-align:right">Sub Total:</td><td style="text-align:right">${parseFloat(po.subtotal || 0).toFixed(2)}</td></tr>
      <tr class="totals-row"><td colspan="2" style="text-align:right">GST:</td><td style="text-align:right">${parseFloat(po.gst_total || 0).toFixed(2)}</td></tr>
      <tr class="totals-row"><td colspan="2" style="text-align:right">Total:</td><td style="text-align:right">${parseFloat(po.total || 0).toFixed(2)}</td></tr>
    </tfoot>
  </table>

  <div class="footer">
    <div class="poc-box"><strong>Order POC:</strong><br/>${po.poc_name || ''}</div>
    <div class="poc-box"><strong>Contact Details:</strong><br/>${po.poc_email || ''} | ${po.poc_phone || ''}</div>
  </div>

  <div class="terms">
    <p><strong>Payment terms:</strong> ${po.payment_terms || ''}</p><br/>
    <p><strong>Other terms &amp; conditions:</strong> ${po.other_terms || ''}</p>
  </div>

  <div class="sign">For ${company.name}<br/><br/>${fmt(po.created_at)}</div>
  <div style="text-align:center; margin-top:20px; font-size:9px;">PAGE 1 of 2</div>
</div>

<div class="page page-break">
  <div class="header-row">
    <div class="logo">XCLUSIVE<br/><small>INTERIORS / ARCHITECTURE</small></div>
    <div>
      <h1>Purchase Order</h1>
      <div class="po-num">${po.po_number}</div>
      <div class="date">Date: ${fmt(po.created_at)}</div>
    </div>
  </div>

  <h3 style="margin-bottom:8px">Annexure1</h3>
  <table>
    <thead>
      <tr>
        <th>S.No.</th><th>Element</th><th>Description</th><th>Category</th>
        <th>UOM</th><th>Qty</th><th>Rate</th><th>Brand/Make</th><th>GST %</th><th>Total Amount</th>
      </tr>
    </thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>
  <div style="text-align:center; margin-top:20px; font-size:9px;">PAGE 2 of 2</div>
</div>

</body>
</html>`;
};

const generateReceiptPdf = async (po) => {
  const outputDir = path.join(__dirname, '../uploads/receipt-pdfs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const safeFilename = po.po_number.replace(/\//g, '-');
  const outputPath = path.join(outputDir, `${safeFilename}-receipt.pdf`);

  const html = buildReceiptHtml(po);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
  } finally {
    await browser.close();
  }

  return outputPath;
};

const buildReceiptHtml = (po) => {
  const company = {
    name:    process.env.COMPANY_NAME    || 'Xclusive Interiors Pvt. Ltd.',
    address: process.env.COMPANY_ADDRESS || '208, Vision Galleria, Near Kunal Icon, Pimple Saudagar, Pune 411027',
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const challanDataUrl = toDataUrl(po.receipt_challan_url);

  const lineItemsHtml = (po.line_items || []).map((item, i) => {
    const poQty    = parseFloat(item.quantity   || 0);
    const recvQty  = item.received_qty !== null && item.received_qty !== undefined
      ? parseFloat(item.received_qty)
      : null;
    const hasDisc  = recvQty !== null && recvQty !== poQty;
    const rowStyle = hasDisc ? 'background:#fffbeb' : '';

    return `
      <tr style="${rowStyle}">
        <td>${i + 1}</td>
        <td>${item.item_name || ''}</td>
        <td>${item.category_name || ''}</td>
        <td>${item.unit || ''}</td>
        <td style="text-align:right">${poQty.toFixed(2)}</td>
        <td style="text-align:right;${hasDisc ? 'color:#b45309;font-weight:bold' : ''}">${recvQty !== null ? recvQty.toFixed(2) : '—'}</td>
        <td>${hasDisc ? (item.receipt_note || '') : ''}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
  .page { padding: 10mm; }
  h1 { font-size: 20px; font-weight: bold; text-align: right; }
  .po-num { font-size: 13px; text-align: right; }
  .date { font-size: 11px; text-align: right; }
  .header-row { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
  .logo { font-size: 18px; font-weight: bold; letter-spacing: 2px; }
  .logo small { display:block; font-size: 9px; font-weight: normal; letter-spacing: 1px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #ccc; margin-bottom: 10px; }
  .info-cell { padding: 6px 8px; border: 1px solid #ccc; }
  .info-cell strong { display: block; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #1a1a1a; color: #fff; padding: 5px 4px; text-align: left; font-size: 9px; }
  td { padding: 4px; border-bottom: 1px solid #eee; font-size: 9px; }
  .verified-banner { background: #dcfce7; border: 1px solid #86efac; padding: 6px 10px; margin-bottom: 10px; font-size: 10px; color: #166534; }
  .challan-section { margin-top: 10px; }
  .challan-section img { max-width: 300px; max-height: 200px; border: 1px solid #ccc; }
</style>
</head>
<body>
<div class="page">
  <div class="header-row">
    <div class="logo">XCLUSIVE<br/><small>INTERIORS / ARCHITECTURE</small></div>
    <div>
      <h1>Goods Receipt</h1>
      <div class="po-num">${po.po_number}</div>
      <div class="date">Submitted: ${fmt(po.receipt_submitted_at)}</div>
    </div>
  </div>

  <div class="verified-banner">
    ✅ Verified by: ${po.receipt_verified_by_name || 'Admin'} &nbsp;|&nbsp; ${fmt(po.receipt_verified_at)}
  </div>

  <div class="info-grid">
    <div class="info-cell">
      <strong>Project:</strong> ${po.project_name || ''} (${po.project_code || ''})<br/>
      <strong>Vendor:</strong> ${po.vendor_name || ''}<br/>
      <strong>Submitted by:</strong> ${po.receipt_submitted_by_name || ''}
    </div>
    <div class="info-cell">
      <strong>Company:</strong> ${company.name}<br/>
      <strong>Address:</strong> ${company.address}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>S.No.</th><th>Item</th><th>Category</th><th>UOM</th>
        <th style="text-align:right">PO Qty</th>
        <th style="text-align:right">Received Qty</th>
        <th>Side Note</th>
      </tr>
    </thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>

  ${challanDataUrl ? `
  <div class="challan-section">
    <strong>Challan:</strong><br/>
    <img src="${challanDataUrl}" alt="Challan" />
  </div>` : ''}
</div>
</body>
</html>`;
};

module.exports = { generatePOPdf, generateReceiptPdf };
