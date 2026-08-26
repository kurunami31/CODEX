// Draws the digital ID card directly onto a canvas for PNG download.
// Rendered by hand (not DOM capture) so cross-origin avatars load reliably
// and the name never gets clipped by layout measurement.

import { initials, avatarStyle, truncate } from '../lib/format';

// Pull the hex stops out of avatarStyle()'s CSS gradient string
// (e.g. 'linear-gradient(135deg,#0ED0B6,#7ce9d8)') so we can draw a
// matching gradient on canvas — addColorStop needs plain colors.
function avatarGradientColors(seed) {
  const css = avatarStyle(seed);
  const hex = String(css).match(/#[0-9a-fA-F]{6}/g) || [];
  return hex.length ? hex : ['#0ed0b6', '#7ce9d8'];
}

function fillAvatarTile(ctx, x, y, w, h, seed) {
  const colors = avatarGradientColors(seed);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[colors.length - 1]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

// Logical card layout is 2× the visual card (428×270 → 856×540).
// The export canvas is drawn at ID_CARD_SCALE× that — 4× → 3424×2160 (HD).
export const ID_CARD_W = 856;
export const ID_CARD_H = 540;
export const ID_CARD_SCALE = 4;
const W = ID_CARD_W;
const H = ID_CARD_H;

const OCR = "'OCR A Extended', 'Courier New', monospace";
const FID = "'Nulshock', 'Arial Black', sans-serif";
const BODY = "'Inter', system-ui, sans-serif";

const INK = '#0b2b3a';
const PRIMARY = '#1a5d78';
const ACCENT = '#0ed0b6';
const MUTED = '#67838c';
const TEXT = '#274a58';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, font, maxWidth, maxSize, minSize) {
  let size = maxSize;
  ctx.font = font(size);
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 1;
    ctx.font = font(size);
  }
  return size;
}

function loadImage(src, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
    setTimeout(() => reject(new Error('image load timed out')), timeout);
  });
}

export async function drawIdCard(ctx, { profile, avatarUrl, qr }) {
  // everything below draws in logical 856×540 units; scale up for the HD export
  ctx.setTransform(ID_CARD_SCALE, 0, 0, ID_CARD_SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // ── background watermark: CB logo (ghost) ──
  try {
    const cbLogoImg = await loadImage('/assets/cb-logo.png');
    const maxDim = Math.min(W, H) * 0.5;
    const scale = Math.min(maxDim / cbLogoImg.width, maxDim / cbLogoImg.height);
    const logoW = cbLogoImg.width * scale;
    const logoH = cbLogoImg.height * scale;
    const logoX = (W - logoW) / 2;
    const logoY = (H - logoH) / 2;
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.drawImage(cbLogoImg, logoX, logoY, logoW, logoH);
    ctx.restore();
  } catch {
    /* logo unavailable — skip */
  }

  // background + frame
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.6, '#f3fbfa');
  bg.addColorStop(1, '#e6f6f3');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 36);
  ctx.fill();
  ctx.strokeStyle = PRIMARY;
  ctx.lineWidth = 4;
  ctx.stroke();

  const pad = 28;
  const x0 = pad;
  const x1 = W - pad;

  // ── header: DOrSU logo + org name ──
  try {
    const logo = await loadImage('/assets/dorsu-logo.png');
    const logoBox = 64;
    ctx.save();
    roundRect(ctx, x0, 28, logoBox, logoBox, 14);
    ctx.clip();
    ctx.drawImage(logo, x0, 28, logoBox, logoBox);
    ctx.restore();
  } catch {
    /* logo unavailable — skip */
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = PRIMARY;
  ctx.font = `700 22px ${OCR}`;
  ctx.fillText('CODEBYTERS', x1, 52);
  ctx.fillStyle = MUTED;
  ctx.font = `12px ${OCR}`;
  ctx.fillText('BSIT STUDENT ORGANIZATION', x1, 76);
  ctx.textAlign = 'left';

  // ── teal strip ──
  const stripY = 112;
  const stripH = 30;
  const stripGrad = ctx.createLinearGradient(0, stripY, W, stripY);
  stripGrad.addColorStop(0, PRIMARY);
  stripGrad.addColorStop(1, '#236f8d');
  ctx.fillStyle = stripGrad;
  ctx.fillRect(0, stripY, W, stripH);
  ctx.fillStyle = '#dffef8';
  ctx.font = `14px ${OCR}`;
  ctx.textAlign = 'center';
  ctx.fillText('OFFICIAL STUDENT IDENTITY · BSIT', W / 2, stripY + 20);
  ctx.textAlign = 'left';

  // ── main: photo + name/details + QR ──
  const mainTop = stripY + stripH + 20;
  const mainBottom = H - 64;

  // Portrait matches the on-screen card: 4:5 photo box, centered crop
  // (object-fit: cover equivalent) — never stretched.
  const photoW = 150;
  const photoH = Math.round(photoW * 1.25); // 4:5
  const photoX = x0 + 8;
  const photoY = mainTop + 8;

  // portrait photo
  const drawInitialsTile = () => {
    fillAvatarTile(ctx, photoX, photoY, photoW, photoH, profile?.full_name || profile?.student_id || '');
    ctx.fillStyle = '#04252b';
    ctx.font = `700 44px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText(initials(profile?.full_name), photoX + photoW / 2, photoY + photoH / 2 + 15);
    ctx.textAlign = 'left';
  };

  ctx.save();
  roundRect(ctx, photoX, photoY, photoW, photoH, 16);
  ctx.clip();
  if (avatarUrl) {
    try {
      const bust = `${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}dl=${Date.now()}`;
      const img = await loadImage(bust);
      // cover-crop: scale so the box is fully covered, then center the window
      const scale = Math.max(img.width / photoW, img.height / photoH);
      const sw = photoW * scale;
      const sh = photoH * scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, photoX, photoY, photoW, photoH);
    } catch {
      // fall back to initials tile
      drawInitialsTile();
    }
  } else {
    drawInitialsTile();
  }
  ctx.restore();
  ctx.strokeStyle = PRIMARY;
  ctx.lineWidth = 4;
  roundRect(ctx, photoX, photoY, photoW, photoH, 16);
  ctx.stroke();

  // info column
  const infoX = photoX + photoW + 26;
  const infoW = x1 - 30 - 178 - infoX; // room for QR on the right

  ctx.fillStyle = MUTED;
  ctx.font = `11px ${OCR}`;
  ctx.fillText('NAME', infoX, mainTop + 18);

  const nameY = mainTop + 52;
  const rawName = profile?.full_name || 'STUDENT';
  ctx.fillStyle = INK;
  const nameSize = fitText(ctx, rawName, (s) => `700 ${s}px ${FID}`, infoW, 34, 20);
  ctx.font = `700 ${nameSize}px ${FID}`;
  // last-resort guard: never let the name clip at the edge of the card
  let name = rawName;
  while (name.length > 1 && ctx.measureText(name).width > infoW) {
    name = truncate(name, name.length - 1);
  }
  ctx.fillText(name, infoX, nameY);

  ctx.fillStyle = MUTED;
  ctx.font = `11px ${OCR}`;
  ctx.fillText('DETAILS', infoX, mainTop + 74);

  ctx.fillStyle = TEXT;
  ctx.font = `15px ${OCR}`;
  const lines = [
    `YEAR : ${profile?.year_level || '—'}`,
    `SEC  : ${profile?.section || '—'}`,
    `ID   : ${profile?.student_id || '—'}`,
  ];
  lines.forEach((ln, i) => {
    ctx.fillText(ln, infoX, mainTop + 100 + i * 24);
  });

  // QR block — rendered large so phone cameras scan the saved PNG reliably
  const qrBox = 170;
  const qrX = x1 - qrBox;
  const qrY = mainTop + 6;
  if (qr) {
    try {
      const qrImg = await loadImage(qr);
      ctx.drawImage(qrImg, qrX, qrY, qrBox, qrBox);
      ctx.strokeStyle = '#0b2b3a';
      ctx.lineWidth = 3;
      roundRect(ctx, qrX, qrY, qrBox, qrBox, 8);
      ctx.stroke();
    } catch {
      /* QR missing — skip */
    }
  }
  ctx.fillStyle = MUTED;
  ctx.font = `11px ${OCR}`;
  ctx.textAlign = 'center';
  ctx.fillText('SCAN ME', qrX + qrBox / 2, qrY + qrBox + 22);
  ctx.textAlign = 'left';

  // ── footer ──
  ctx.fillStyle = MUTED;
  ctx.font = `12px ${OCR}`;
  ctx.fillText('DAVAO ORIENTAL STATE UNIVERSITY', x0, mainBottom + 24);
  ctx.fillStyle = '#075e55';
  ctx.textAlign = 'right';
  ctx.fillText('CODEBYTERS · BSIT STUDENT ORGANIZATION', x1, mainBottom + 24);
  ctx.textAlign = 'left';

  return ctx;
}
