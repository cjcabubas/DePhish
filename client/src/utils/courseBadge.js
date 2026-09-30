const SVG_WIDTH = 1200;
const SVG_HEIGHT = 850;

function xml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]);
}

function badgeSvg({ moduleTitle, learnerName, completedAt }) {
  const date = new Date(completedAt);
  const issued = Number.isNaN(date.getTime())
    ? 'Completion date unavailable'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const name = String(learnerName || 'DePhish Learner').trim().slice(0, 48);
  const title = String(moduleTitle || 'Learning Module').trim().slice(0, 54);
  const titleFontSize = title.length > 36 ? 46 : 56;
  const nameFontSize = name.length > 32 ? 42 : 50;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#092f3b"/><stop offset="1" stop-color="#125a62"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe5a0"/><stop offset="1" stop-color="#e6ad49"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#051d25" flood-opacity=".24"/></filter>
  </defs>
  <rect width="1200" height="850" rx="34" fill="#f5f8f6"/>
  <rect x="20" y="20" width="1160" height="810" rx="26" fill="url(#bg)"/>
  <path d="M52 180 C290 40 910 40 1148 180 M52 670 C290 810 910 810 1148 670" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/>
  <rect x="55" y="55" width="1090" height="740" rx="18" fill="none" stroke="url(#gold)" stroke-opacity=".74" stroke-width="2"/>
  <g transform="translate(600 178)" filter="url(#shadow)">
    <path d="M-50 34 L-76 112 L-25 96 L0 140 L25 96 L76 112 L50 34" fill="#2bb4a2"/>
    <circle r="78" fill="url(#gold)"/>
    <circle r="65" fill="#0e4954" stroke="#fff0bd" stroke-width="3"/>
    <path d="M0-38 L34-25 V2 C34 26 18 43 0 53 C-18 43-34 26-34 2 V-25 Z" fill="none" stroke="#ffe5a0" stroke-width="6" stroke-linejoin="round"/>
    <path d="M-16 1 L-4 13 L19-13" fill="none" stroke="#7be0cb" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="600" y="310" text-anchor="middle" fill="#9de4d5" font-family="Arial,sans-serif" font-size="21" font-weight="700" letter-spacing="7">DEPHISH ACADEMY</text>
  <text x="600" y="375" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="39" font-weight="700" letter-spacing="3">CERTIFICATE OF COMPLETION</text>
  <text x="600" y="440" text-anchor="middle" fill="#c7d8d9" font-family="Arial,sans-serif" font-size="24">This badge is awarded to</text>
  <text x="600" y="510" text-anchor="middle" fill="#ffe5a0" font-family="Arial,sans-serif" font-size="${nameFontSize}" font-weight="700">${xml(name)}</text>
  <path d="M310 538 H890" stroke="#ffffff" stroke-opacity=".24"/>
  <text x="600" y="602" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="${titleFontSize}" font-weight="700">${xml(title)}</text>
  <text x="600" y="652" text-anchor="middle" fill="#c7d8d9" font-family="Arial,sans-serif" font-size="20">for completing every lesson and passing every section quiz</text>
  <text x="600" y="724" text-anchor="middle" fill="#9de4d5" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="2">ISSUED ${xml(issued.toUpperCase())}</text>
  <text x="600" y="770" text-anchor="middle" fill="#ffffff" fill-opacity=".62" font-family="Arial,sans-serif" font-size="17">DEPHISH LEARNING BADGE</text>
</svg>`;
}

export function badgePreviewUrl(details) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(details))}`;
}

async function renderBadge(details, mimeType, quality) {
  const image = new Image();
  const source = URL.createObjectURL(new Blob([badgeSvg(details)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not render the badge.'));
      image.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = SVG_WIDTH;
    canvas.height = SVG_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the badge image.');
    context.drawImage(image, 0, 0, SVG_WIDTH, SVG_HEIGHT);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the badge.')), mimeType, quality);
    });
  } finally {
    URL.revokeObjectURL(source);
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function joinBytes(parts) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function pdfWithJpeg(jpegBytes) {
  const encode = value => new TextEncoder().encode(value);
  const drawing = 'q\n1200 0 0 850 0 0 cm\n/Badge Do\nQ\n';
  const objects = [
    encode('<< /Type /Catalog /Pages 2 0 R >>'),
    encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 850] /Resources << /XObject << /Badge 4 0 R >> >> /Contents 5 0 R >>'),
    joinBytes([
      encode(`<< /Type /XObject /Subtype /Image /Width ${SVG_WIDTH} /Height ${SVG_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
      jpegBytes,
      encode('\nendstream'),
    ]),
    encode(`<< /Length ${drawing.length} >>\nstream\n${drawing}endstream`),
  ];
  const header = encode('%PDF-1.4\n');
  const parts = [header];
  const offsets = [0];
  let offset = header.length;
  objects.forEach((body, index) => {
    offsets.push(offset);
    const wrapped = joinBytes([encode(`${index + 1} 0 obj\n`), body, encode('\nendobj\n')]);
    parts.push(wrapped);
    offset += wrapped.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const objectOffset of offsets.slice(1)) xref += `${String(objectOffset).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(encode(xref));
  return new Blob(parts, { type: 'application/pdf' });
}

export async function downloadBadge(details, format) {
  const slug = String(details.moduleTitle || 'learning-module').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (format === 'png') {
    saveBlob(await renderBadge(details, 'image/png'), `dephish-${slug}-badge.png`);
    return;
  }
  const jpeg = await renderBadge(details, 'image/jpeg', 0.96);
  saveBlob(pdfWithJpeg(new Uint8Array(await jpeg.arrayBuffer())), `dephish-${slug}-badge.pdf`);
}
