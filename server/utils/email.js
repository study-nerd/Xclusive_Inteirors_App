const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (v) => {
  const n = Number(v);
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const uniqEmails = (arr) => {
  return Array.from(new Set((arr || []).filter(Boolean).map((e) => String(e).trim()).filter(Boolean)));
};

/**
 * Send PO email with PDF attachment.
 * If internalOnly=true, this is an internal fallback when vendor email is missing.
 */
const sendPOEmail = async ({ toEmails = [], ccEmails = [], po, pdfPath, internalOnly = false, approvedByName = 'Admin' }) => {
  const companyName = process.env.COMPANY_NAME || 'Xclusive Interiors Pvt. Ltd.';
  const to = uniqEmails(toEmails);
  const cc = uniqEmails(ccEmails).filter((email) => !to.includes(email));

  if (!to.length) {
    throw new Error('No recipient email configured for PO email');
  }

  const lineItems = Array.isArray(po?.line_items) ? po.line_items : [];
  const lineItemsRows = lineItems.length
    ? lineItems.map((it, idx) => `
      <tr>
        <td style="border:1px solid #ddd;padding:6px;">${idx + 1}</td>
        <td style="border:1px solid #ddd;padding:6px;">${esc(it.item_name || '-')}</td>
        <td style="border:1px solid #ddd;padding:6px;">${esc(it.description || '-')}</td>
        <td style="border:1px solid #ddd;padding:6px;">${esc(it.category_name || '-')}</td>
        <td style="border:1px solid #ddd;padding:6px;">${esc(it.unit || '-')}</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:right;">${esc(it.quantity ?? '-')}</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtMoney(it.rate)}</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:right;">${esc(it.gst_percent ?? '-')}%</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtMoney(it.total)}</td>
      </tr>
    `).join('')
    : `
      <tr>
        <td colspan="9" style="border:1px solid #ddd;padding:8px;text-align:center;">No line items</td>
      </tr>
    `;

  const internalBanner = internalOnly
    ? `<div style="background:#fff7e6;border:1px solid #ffd591;padding:10px;margin:0 0 12px 0;border-radius:6px;">
         Vendor email is missing. This PO email was sent to internal recipients only.
       </div>`
    : '';

  await transporter.sendMail({
    from: `"${companyName}" <${process.env.GMAIL_USER}>`,
    to,
    ...(cc.length ? { cc } : {}),
    subject: `Purchase Order ${po.po_number} - ${companyName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;color:#111;">
        <h2 style="margin:0 0 10px 0;">Purchase Order: ${esc(po.po_number || '')}</h2>
        ${internalBanner}
        <p style="margin:0 0 12px 0;">
          Dear ${esc(po.vendor_name || 'Team')},<br/>
          Please find attached the Purchase Order PDF.
        </p>

        <h3 style="margin:14px 0 6px 0;">PO Details</h3>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <tr><td style="padding:5px 0;"><strong>PO Number:</strong> ${esc(po.po_number || '-')}</td><td style="padding:5px 0;"><strong>Status:</strong> ${esc(po.status || '-')}</td></tr>
          <tr><td style="padding:5px 0;"><strong>Project:</strong> ${esc(po.project_name || '-')}</td><td style="padding:5px 0;"><strong>Project Code:</strong> ${esc(po.project_code || '-')}</td></tr>
          <tr><td style="padding:5px 0;"><strong>Vendor:</strong> ${esc(po.vendor_name || '-')}</td><td style="padding:5px 0;"><strong>Vendor Email:</strong> ${esc(po.vendor_email || '-')}</td></tr>
          <tr><td style="padding:5px 0;"><strong>Created By:</strong> ${esc(po.created_by_name || '-')}</td><td style="padding:5px 0;"><strong>Approved By:</strong> ${esc(approvedByName)}</td></tr>
          <tr><td style="padding:5px 0;"><strong>Work Start:</strong> ${fmtDate(po.work_start_date)}</td><td style="padding:5px 0;"><strong>Work End:</strong> ${fmtDate(po.work_end_date)}</td></tr>
          <tr><td style="padding:5px 0;"><strong>Payment Terms:</strong> ${esc(po.payment_terms || '-')}</td><td style="padding:5px 0;"><strong>Site Address:</strong> ${esc(po.site_address || '-')}</td></tr>
          <tr><td style="padding:5px 0;"><strong>POC:</strong> ${esc(po.poc_name || '-')}</td><td style="padding:5px 0;"><strong>POC Email:</strong> ${esc(po.poc_email || '-')}</td></tr>
          <tr><td style="padding:5px 0;"><strong>Subtotal:</strong> ${fmtMoney(po.subtotal)}</td><td style="padding:5px 0;"><strong>GST Total:</strong> ${fmtMoney(po.gst_total)}</td></tr>
          <tr><td style="padding:5px 0;"><strong>Grand Total:</strong> ${fmtMoney(po.total)}</td><td style="padding:5px 0;"><strong>Other Terms:</strong> ${esc(po.other_terms || '-')}</td></tr>
        </table>

        <h3 style="margin:16px 0 8px 0;">Line Items</h3>
        <table style="border-collapse:collapse;width:100%;font-size:12px;">
          <thead>
            <tr style="background:#f6f6f6;">
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">#</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">Item</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">Description</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">Category</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">UOM</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Qty</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Rate</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">GST %</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${lineItemsRows}</tbody>
        </table>

        <p style="color:#666;font-size:12px;margin-top:14px;">
          This is an auto-generated email from ${esc(companyName)}. Please do not reply directly.
        </p>
      </div>
    `,
    attachments: [
      {
        filename: `${po.po_number}.pdf`,
        path: pdfPath,
        contentType: 'application/pdf',
      },
    ],
  });
};

module.exports = { sendPOEmail };
