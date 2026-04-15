"""
Convert PROJECT_ANALYSIS.md to Project_Full_Documentation.pdf
Uses Python reportlab (already installed) with a custom markdown parser.
"""

import re
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, Preformatted, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase import pdfmetrics

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MD_PATH  = os.path.join(BASE_DIR, "PROJECT_ANALYSIS.md")
PDF_PATH = os.path.join(BASE_DIR, "Project_Full_Documentation.pdf")

# ── Colour palette ───────────────────────────────────────────────────────────
BRAND_DARK   = colors.HexColor("#1a1a2e")
BRAND_ACCENT = colors.HexColor("#16213e")
BRAND_LIGHT  = colors.HexColor("#0f3460")
BRAND_GOLD   = colors.HexColor("#e94560")
TABLE_HEADER = colors.HexColor("#1a1a2e")
TABLE_ALT    = colors.HexColor("#f4f6f8")
TABLE_BORDER = colors.HexColor("#d0d7de")
CODE_BG      = colors.HexColor("#f6f8fa")
CODE_BORDER  = colors.HexColor("#d0d7de")

# ── Style definitions ─────────────────────────────────────────────────────────
def make_styles():
    base = getSampleStyleSheet()

    styles = {
        "h1": ParagraphStyle("h1",
            fontSize=22, fontName="Helvetica-Bold",
            textColor=BRAND_DARK, spaceAfter=8, spaceBefore=18,
            leading=26, borderPad=4),

        "h2": ParagraphStyle("h2",
            fontSize=16, fontName="Helvetica-Bold",
            textColor=BRAND_LIGHT, spaceAfter=6, spaceBefore=14,
            leading=20, borderWidth=0, borderColor=BRAND_LIGHT,
            borderPad=2),

        "h3": ParagraphStyle("h3",
            fontSize=13, fontName="Helvetica-Bold",
            textColor=BRAND_ACCENT, spaceAfter=4, spaceBefore=10,
            leading=16),

        "h4": ParagraphStyle("h4",
            fontSize=11, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#333333"), spaceAfter=3,
            spaceBefore=8, leading=14),

        "body": ParagraphStyle("body",
            fontSize=9, fontName="Helvetica",
            spaceAfter=4, spaceBefore=2,
            leading=13, textColor=colors.HexColor("#222222")),

        "bullet": ParagraphStyle("bullet",
            fontSize=9, fontName="Helvetica",
            spaceAfter=2, spaceBefore=1,
            leading=13, leftIndent=14,
            bulletIndent=4, textColor=colors.HexColor("#222222")),

        "bullet2": ParagraphStyle("bullet2",
            fontSize=9, fontName="Helvetica",
            spaceAfter=2, spaceBefore=1,
            leading=13, leftIndent=28,
            bulletIndent=18, textColor=colors.HexColor("#444444")),

        "code": ParagraphStyle("code",
            fontSize=7.5, fontName="Courier",
            spaceAfter=2, spaceBefore=2,
            leading=11, textColor=colors.HexColor("#24292e"),
            backColor=CODE_BG, borderColor=CODE_BORDER,
            borderWidth=0.5, borderPad=4, leftIndent=4),

        "blockquote": ParagraphStyle("blockquote",
            fontSize=9, fontName="Helvetica-Oblique",
            spaceAfter=4, spaceBefore=4,
            leading=13, leftIndent=20, textColor=colors.HexColor("#555555"),
            borderWidth=2, borderColor=colors.HexColor("#0f3460"),
            borderPad=6),

        "th": ParagraphStyle("th",
            fontSize=8, fontName="Helvetica-Bold",
            textColor=colors.white, leading=11),

        "td": ParagraphStyle("td",
            fontSize=8, fontName="Helvetica",
            textColor=colors.HexColor("#222222"), leading=11),

        "td_code": ParagraphStyle("td_code",
            fontSize=7.5, fontName="Courier",
            textColor=colors.HexColor("#24292e"), leading=11),

        "toc_title": ParagraphStyle("toc_title",
            fontSize=18, fontName="Helvetica-Bold",
            textColor=BRAND_DARK, spaceAfter=12, spaceBefore=8,
            leading=22),

        "meta": ParagraphStyle("meta",
            fontSize=9, fontName="Helvetica",
            textColor=colors.HexColor("#666666"), spaceAfter=3,
            leading=13),
    }
    return styles


# ── Inline markdown formatting ────────────────────────────────────────────────
def fmt(text, style_name="body"):
    """Convert inline markdown to ReportLab XML tags."""
    # Escape XML first
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Inline code first (protect from other substitutions)
    # Use a placeholder to avoid double-processing
    code_parts = []
    def save_code(m):
        idx = len(code_parts)
        # Escape angle brackets inside code
        inner = m.group(1).replace("&amp;", "&amp;amp;")
        code_parts.append(f'<font name="Courier" size="8">{inner}</font>')
        return f"\x00CODE{idx}\x00"
    text = re.sub(r'`([^`]+)`', save_code, text)

    # Bold italic ***
    text = re.sub(r'\*\*\*(.*?)\*\*\*', r'<b><i>\1</i></b>', text)
    # Bold **
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    # Bold __word__ (only when surrounded by word boundaries/spaces)
    text = re.sub(r'(?<!\w)__(.*?)__(?!\w)', r'<b>\1</b>', text)
    # Italic *word* (single asterisk, not __)
    text = re.sub(r'\*([^*\n]+)\*', r'<i>\1</i>', text)
    # Italic _word_ only when surrounded by spaces/punctuation (not inside identifiers)
    text = re.sub(r'(?<!\w)_([^_\n]+?)_(?!\w)', r'<i>\1</i>', text)
    # Strikethrough — just remove markers
    text = re.sub(r'~~(.*?)~~', r'\1', text)

    # Restore code spans
    for idx, replacement in enumerate(code_parts):
        text = text.replace(f"\x00CODE{idx}\x00", replacement)

    return text


# ── Table parser ──────────────────────────────────────────────────────────────
def parse_md_table(lines, styles):
    """Parse a markdown table and return a ReportLab Table flowable."""
    rows = []
    is_header = True
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if re.match(r'^\|[-:| ]+\|?$', line):
            # Separator row — marks end of header
            is_header = False
            continue
        # Parse cells
        cells = [c.strip() for c in re.split(r'\|', line) if c.strip() or True]
        # Remove empty first/last from leading/trailing |
        if cells and cells[0] == '':
            cells = cells[1:]
        if cells and cells[-1] == '':
            cells = cells[:-1]

        if not cells:
            continue

        if is_header:
            row = [Paragraph(fmt(c), styles["th"]) for c in cells]
        else:
            processed = []
            for c in cells:
                # Detect code-like content
                if c.startswith('`') and c.endswith('`'):
                    processed.append(Paragraph(fmt(c), styles["td_code"]))
                else:
                    processed.append(Paragraph(fmt(c), styles["td"]))
            row = processed
        rows.append(row)

    if not rows:
        return None

    # Calculate column widths
    page_width = A4[0] - 40*mm
    n_cols = max(len(r) for r in rows)
    col_width = page_width / n_cols

    # Normalise row lengths
    for r in rows:
        while len(r) < n_cols:
            r.append(Paragraph("", styles["td"]))

    t = Table(rows, colWidths=[col_width] * n_cols, repeatRows=1)

    style_cmds = [
        ("BACKGROUND",   (0, 0),  (-1, 0),  TABLE_HEADER),
        ("TEXTCOLOR",    (0, 0),  (-1, 0),  colors.white),
        ("FONTNAME",     (0, 0),  (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0),  (-1, 0),  8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, TABLE_ALT]),
        ("FONTNAME",     (0, 1),  (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 1),  (-1, -1), 8),
        ("GRID",         (0, 0),  (-1, -1), 0.4, TABLE_BORDER),
        ("VALIGN",       (0, 0),  (-1, -1), "TOP"),
        ("TOPPADDING",   (0, 0),  (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0),  (-1, -1), 4),
        ("LEFTPADDING",  (0, 0),  (-1, -1), 5),
        ("RIGHTPADDING", (0, 0),  (-1, -1), 5),
        ("WORDWRAP",     (0, 0),  (-1, -1), True),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t


# ── Main parser ───────────────────────────────────────────────────────────────
def parse_markdown(text, styles):
    """Convert markdown text to a list of ReportLab flowables."""
    flowables = []
    lines = text.split("\n")
    i = 0

    def add_spacer(h=4):
        flowables.append(Spacer(1, h*mm))

    while i < len(lines):
        line = lines[i]

        # ── YAML front matter / meta lines (> prefixed)
        if line.startswith("> "):
            content = line[2:].strip()
            flowables.append(Paragraph(fmt(content), styles["meta"]))
            i += 1
            continue

        # ── Horizontal rule
        if re.match(r'^---+\s*$', line) or re.match(r'^===+\s*$', line):
            flowables.append(Spacer(1, 2*mm))
            flowables.append(HRFlowable(width="100%", thickness=0.5,
                                        color=TABLE_BORDER, spaceAfter=4))
            i += 1
            continue

        # ── Headings
        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            level = len(m.group(1))
            text_h = m.group(2).strip()
            # Strip anchor links like {#anchor}
            text_h = re.sub(r'\s*\{#[^}]+\}', '', text_h)
            style_key = f"h{min(level, 4)}"
            if level == 1:
                flowables.append(Spacer(1, 6*mm))
                para = Paragraph(fmt(text_h), styles["h1"])
                flowables.append(para)
                flowables.append(HRFlowable(width="100%", thickness=1.5,
                                            color=BRAND_DARK, spaceAfter=4))
            else:
                flowables.append(Paragraph(fmt(text_h), styles[style_key]))
            i += 1
            continue

        # ── Code block (``` ... ```)
        if line.startswith("```"):
            lang = line[3:].strip()
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```

            # Skip Mermaid diagrams (can't render in PDF)
            if lang.lower() == "mermaid":
                note = f"[Diagram: {lang} — see Markdown source for diagram code]"
                flowables.append(Paragraph(note, styles["blockquote"]))
                add_spacer(2)
                continue

            code_text = "\n".join(code_lines)
            # Escape XML in code blocks
            code_text = (code_text.replace("&", "&amp;")
                                   .replace("<", "&lt;")
                                   .replace(">", "&gt;"))
            flowables.append(Preformatted(code_text, styles["code"]))
            add_spacer(2)
            continue

        # ── Table (line starts with |)
        if line.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i])
                i += 1
            tbl = parse_md_table(table_lines, styles)
            if tbl:
                flowables.append(tbl)
                add_spacer(3)
            continue

        # ── Unordered list
        if re.match(r'^(\s*)[*\-+]\s+', line):
            while i < len(lines) and re.match(r'^\s*[*\-+]\s+', lines[i]):
                indent_match = re.match(r'^(\s*)[*\-+]\s+(.*)', lines[i])
                indent = len(indent_match.group(1))
                content = indent_match.group(2)
                style_key = "bullet2" if indent >= 2 else "bullet"
                flowables.append(Paragraph(f"• {fmt(content)}", styles[style_key]))
                i += 1
            add_spacer(1)
            continue

        # ── Ordered list
        if re.match(r'^\s*\d+\.\s+', line):
            counter = {}
            while i < len(lines) and re.match(r'^\s*\d+\.\s+', lines[i]):
                m2 = re.match(r'^(\s*)\d+\.\s+(.*)', lines[i])
                indent = len(m2.group(1))
                content = m2.group(2)
                style_key = "bullet2" if indent >= 2 else "bullet"
                num = int(re.match(r'^\s*(\d+)\.', lines[i]).group(1))
                flowables.append(Paragraph(f"{num}. {fmt(content)}", styles[style_key]))
                i += 1
            add_spacer(1)
            continue

        # ── Blank line
        if line.strip() == "":
            flowables.append(Spacer(1, 3*mm))
            i += 1
            continue

        # ── Regular paragraph
        # Collect consecutive non-special lines
        para_lines = []
        while i < len(lines):
            l = lines[i]
            if (l.strip() == "" or l.startswith("#") or l.startswith("|")
                    or l.startswith("```") or re.match(r'^(\s*)[*\-+]\s+', l)
                    or re.match(r'^\s*\d+\.\s+', l)
                    or re.match(r'^---+\s*$', l)
                    or l.startswith(">")):
                break
            para_lines.append(l)
            i += 1

        if para_lines:
            para_text = " ".join(p.strip() for p in para_lines if p.strip())
            if para_text:
                flowables.append(Paragraph(fmt(para_text), styles["body"]))

    return flowables


# ── Cover page ────────────────────────────────────────────────────────────────
def make_cover(styles):
    elements = []

    elements.append(Spacer(1, 40*mm))

    # Logo / Title block
    title_style = ParagraphStyle("cover_title",
        fontSize=28, fontName="Helvetica-Bold",
        textColor=BRAND_DARK, leading=34, spaceAfter=6, alignment=TA_CENTER)

    sub_style = ParagraphStyle("cover_sub",
        fontSize=14, fontName="Helvetica",
        textColor=BRAND_LIGHT, leading=18, spaceAfter=4, alignment=TA_CENTER)

    tagline_style = ParagraphStyle("cover_tag",
        fontSize=10, fontName="Helvetica-Oblique",
        textColor=colors.HexColor("#555555"), leading=14, alignment=TA_CENTER)

    meta_style = ParagraphStyle("cover_meta",
        fontSize=9, fontName="Helvetica",
        textColor=colors.HexColor("#777777"), leading=13, alignment=TA_CENTER)

    elements.append(Paragraph("XCLUSIVE INTERIORS", title_style))
    elements.append(Spacer(1, 4*mm))
    elements.append(HRFlowable(width="60%", thickness=2, color=BRAND_GOLD,
                                hAlign="CENTER", spaceAfter=8))
    elements.append(Paragraph("Project Architecture & System Documentation", sub_style))
    elements.append(Spacer(1, 6*mm))
    elements.append(Paragraph(
        "PO &amp; Project Management System — Full Technical Reference",
        tagline_style))

    elements.append(Spacer(1, 20*mm))
    elements.append(HRFlowable(width="80%", thickness=0.5, color=TABLE_BORDER,
                                hAlign="CENTER", spaceAfter=8))
    elements.append(Paragraph("Report Date: 2026-04-15", meta_style))
    elements.append(Paragraph("Version: 1.0", meta_style))
    elements.append(Paragraph("Classification: Internal — Stakeholder Reference", meta_style))
    elements.append(Spacer(1, 4*mm))
    elements.append(Paragraph(
        "Xclusive Interiors Pvt. Ltd.  •  208 Vision Galleria, Pimple Saudagar, Pune 411027",
        meta_style))

    elements.append(PageBreak())
    return elements


# ── Header / Footer callbacks ─────────────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    w, h = A4

    # Header bar
    canvas.setFillColor(BRAND_DARK)
    canvas.rect(0, h - 14*mm, w, 14*mm, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(colors.white)
    canvas.drawString(15*mm, h - 9*mm, "XCLUSIVE INTERIORS — System Architecture Documentation")
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(w - 15*mm, h - 9*mm, "CONFIDENTIAL — INTERNAL USE ONLY")

    # Footer
    canvas.setFillColor(colors.HexColor("#888888"))
    canvas.setFont("Helvetica", 7)
    canvas.drawString(15*mm, 8*mm, "Xclusive Interiors Pvt. Ltd. • PO & Project Management System")
    canvas.drawCentredString(w / 2, 8*mm, f"Page {doc.page}")
    canvas.drawRightString(w - 15*mm, 8*mm, "2026-04-15")

    # Footer line
    canvas.setStrokeColor(TABLE_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(15*mm, 12*mm, w - 15*mm, 12*mm)

    canvas.restoreState()


def on_first_page(canvas, doc):
    """Cover page — no header/footer."""
    canvas.saveState()
    w, h = A4
    # Subtle background gradient suggestion (just a light rect)
    canvas.setFillColor(colors.HexColor("#f9fafb"))
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    canvas.restoreState()


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print(f"Reading: {MD_PATH}")
    with open(MD_PATH, "r", encoding="utf-8") as f:
        md_text = f.read()

    styles = make_styles()

    # Build document
    doc = SimpleDocTemplate(
        PDF_PATH,
        pagesize=A4,
        leftMargin=20*mm,
        rightMargin=20*mm,
        topMargin=22*mm,
        bottomMargin=20*mm,
        title="Xclusive Interiors — System Architecture Documentation",
        author="Automated Architectural Audit",
        subject="PO & Project Management System",
        creator="Python reportlab",
    )

    story = []

    # Cover page
    story.extend(make_cover(styles))

    # Parse and add markdown content
    content_flowables = parse_markdown(md_text, styles)
    story.extend(content_flowables)

    # Build PDF
    print(f"Generating PDF: {PDF_PATH}")
    doc.build(story,
              onFirstPage=on_first_page,
              onLaterPages=on_page)

    size_kb = os.path.getsize(PDF_PATH) / 1024
    print(f"[OK] PDF generated successfully: {PDF_PATH}")
    print(f"    File size: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
