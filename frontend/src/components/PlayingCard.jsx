import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// 52-card encoding:
//   id 0..51   suit = floor(id / 13)   rank = id % 13
//   suits: 0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades
//   ranks: 0=A, 1..9=2..10, 10=J, 11=Q, 12=K

export const SUITS = [
  { id: 0, symbol: '♣', name: 'clubs',    color: '#0a0a0a' },
  { id: 1, symbol: '♦', name: 'diamonds', color: '#c41e3a' },
  { id: 2, symbol: '♥', name: 'hearts',   color: '#c41e3a' },
  { id: 3, symbol: '♠', name: 'spades',   color: '#0a0a0a' },
];

export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function decodeCard(id) {
  const suitIdx = Math.floor(id / 13);
  const rankIdx = id % 13;
  return {
    id,
    suit: SUITS[suitIdx],
    rank: RANK_LABELS[rankIdx],
    rankIdx,
    suitIdx,
  };
}

export function cardKey(id) {
  const c = decodeCard(id);
  return `${c.rank}${c.suit.symbol}`;
}

// Canonical pip layouts as fractional [top, left] coordinates.
// `flipped` = render upside-down to give the classic mirrored half.
const PIP_LAYOUTS = {
  '2':  [[0.18, 0.50, false], [0.82, 0.50, true]],
  '3':  [[0.18, 0.50, false], [0.50, 0.50, false], [0.82, 0.50, true]],
  '4':  [[0.20, 0.30, false], [0.20, 0.70, false], [0.80, 0.30, true], [0.80, 0.70, true]],
  '5':  [[0.20, 0.30, false], [0.20, 0.70, false], [0.50, 0.50, false], [0.80, 0.30, true], [0.80, 0.70, true]],
  '6':  [[0.20, 0.30, false], [0.20, 0.70, false], [0.50, 0.30, false], [0.50, 0.70, false], [0.80, 0.30, true], [0.80, 0.70, true]],
  '7':  [[0.20, 0.30, false], [0.20, 0.70, false], [0.34, 0.50, false], [0.50, 0.30, false], [0.50, 0.70, false], [0.80, 0.30, true], [0.80, 0.70, true]],
  '8':  [[0.20, 0.30, false], [0.20, 0.70, false], [0.34, 0.50, false], [0.50, 0.30, false], [0.50, 0.70, false], [0.66, 0.50, true], [0.80, 0.30, true], [0.80, 0.70, true]],
  '9':  [[0.20, 0.30, false], [0.20, 0.70, false], [0.38, 0.30, false], [0.38, 0.70, false], [0.50, 0.50, false], [0.62, 0.30, true], [0.62, 0.70, true], [0.80, 0.30, true], [0.80, 0.70, true]],
  '10': [[0.18, 0.30, false], [0.18, 0.70, false], [0.30, 0.50, false], [0.42, 0.30, false], [0.42, 0.70, false], [0.58, 0.30, true], [0.58, 0.70, true], [0.70, 0.50, true], [0.82, 0.30, true], [0.82, 0.70, true]],
};

// ── Canvas drawing helpers ──────────────────────────────────────────────

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// Draw a single suit symbol centered at (x, y), size px, in given color.
function drawSuitGlyph(ctx, x, y, size, suit, rotated = false) {
  ctx.save();
  ctx.translate(x, y);
  if (rotated) ctx.rotate(Math.PI);
  ctx.fillStyle = suit.color;
  ctx.font = `900 ${size}px "Apple Symbols", "Segoe UI Symbol", "Arial Unicode MS", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(suit.symbol, 0, 0);
  ctx.restore();
}

// Top-left + bottom-right corner labels. Bold serif rank with mini suit below.
function drawCorner(ctx, w, h, rank, suit, rotated) {
  const cx = rotated ? w * 0.91 : w * 0.09;
  const cy = rotated ? h * 0.92 : h * 0.08;

  ctx.save();
  ctx.translate(cx, cy);
  if (rotated) ctx.rotate(Math.PI);
  ctx.fillStyle = suit.color;

  // Rank
  ctx.font = `900 ${w * 0.16}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(rank, 0, 0);

  // Suit beneath the rank (small)
  ctx.font = `900 ${w * 0.13}px "Apple Symbols", "Segoe UI Symbol", Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(suit.symbol, 0, w * 0.16);

  ctx.restore();
}

// Pip pattern for 2-10
function drawPips(ctx, w, h, rank, suit) {
  const layout = PIP_LAYOUTS[rank];
  if (!layout) return;
  const pipSize = w * 0.17;
  for (const [ty, tx, flipped] of layout) {
    drawSuitGlyph(ctx, tx * w, ty * h, pipSize, suit, flipped);
  }
}

// Ace: a single oversized suit glyph in the centre
function drawAce(ctx, w, h, suit) {
  drawSuitGlyph(ctx, w / 2, h / 2, w * 0.55, suit);
}

// Face card (J/Q/K): inner frame with big rank letter + suit
function drawFace(ctx, w, h, rank, suit) {
  // Inner decorative frame
  ctx.save();
  ctx.strokeStyle = `${suit.color}55`;
  ctx.lineWidth = w * 0.012;
  roundRectPath(ctx, w * 0.10, h * 0.10, w * 0.80, h * 0.80, w * 0.05);
  ctx.stroke();

  // Ornamental flourish top
  ctx.fillStyle = `${suit.color}66`;
  ctx.font = `900 ${w * 0.10}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✦', w / 2, h * 0.22);

  // Big italic rank
  ctx.fillStyle = suit.color;
  ctx.font = `900 italic ${w * 0.55}px Georgia, "Times New Roman", serif`;
  ctx.fillText(rank, w / 2, h * 0.50);

  // Suit symbol beneath rank
  ctx.font = `900 ${w * 0.30}px "Apple Symbols", "Segoe UI Symbol", Arial, sans-serif`;
  ctx.fillText(suit.symbol, w / 2, h * 0.74);

  // Ornamental flourish bottom
  ctx.fillStyle = `${suit.color}66`;
  ctx.font = `900 ${w * 0.10}px Georgia, serif`;
  ctx.fillText('✦', w / 2, h * 0.86);

  ctx.restore();
}

// Subtle "Loot Market" watermark seal in the centre
function drawWatermark(ctx, w, h, suit) {
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = suit.color;
  ctx.fillStyle = suit.color;

  const cx = w / 2, cy = h / 2;
  const r = w * 0.18;

  ctx.lineWidth = w * 0.008;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = w * 0.004;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = `900 ${w * 0.14}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LM', cx, cy);

  ctx.restore();
}

// Full card front
function drawCardFront(ctx, w, h, id) {
  const c = decodeCard(id);
  const r = w * 0.08;

  // Off-white card with very subtle gradient (top-light, bottom-darker)
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#fefefe');
  bg.addColorStop(1, '#ebecef');
  ctx.fillStyle = bg;
  roundRectPath(ctx, 0, 0, w, h, r);
  ctx.fill();

  // Outer hairline
  ctx.lineWidth = Math.max(1, w * 0.01);
  ctx.strokeStyle = '#0a0a0a';
  roundRectPath(ctx, w * 0.005, h * 0.005, w * 0.99, h * 0.99, r * 0.95);
  ctx.stroke();

  // Inner subtle shadow ring
  ctx.lineWidth = Math.max(1, w * 0.004);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  roundRectPath(ctx, w * 0.04, h * 0.04, w * 0.92, h * 0.92, r * 0.85);
  ctx.stroke();

  // Watermark sits behind the central content
  if (!['J', 'Q', 'K'].includes(c.rank) && c.rank !== 'A') {
    drawWatermark(ctx, w, h, c.suit);
  }

  // Centre content
  if (c.rank === 'A') {
    drawAce(ctx, w, h, c.suit);
  } else if (['J', 'Q', 'K'].includes(c.rank)) {
    drawFace(ctx, w, h, c.rank, c.suit);
  } else {
    drawPips(ctx, w, h, c.rank, c.suit);
  }

  // Corner labels (top-left + bottom-right rotated)
  drawCorner(ctx, w, h, c.rank, c.suit, false);
  drawCorner(ctx, w, h, c.rank, c.suit, true);
}

// Card back — emerald felt with a layered gold rosette + LM medallion.
function drawCardBack(ctx, w, h) {
  const r = w * 0.08;
  const cx = w / 2, cy = h / 2;
  const GOLD       = 'rgba(229,193,108,';
  const GOLD_BRIGHT = 'rgba(245,210,122,';

  // 1. Deep emerald field with a centered radial highlight (3D lift).
  const bg = ctx.createRadialGradient(cx, cy * 0.82, w * 0.05, cx, cy, w * 1.05);
  bg.addColorStop(0, '#1f7a3b');
  bg.addColorStop(0.55, '#0f4d23');
  bg.addColorStop(1, '#04210f');
  ctx.fillStyle = bg;
  roundRectPath(ctx, 0, 0, w, h, r);
  ctx.fill();

  // 2. Outer hairline.
  ctx.lineWidth = Math.max(1, w * 0.01);
  ctx.strokeStyle = '#050505';
  roundRectPath(ctx, w * 0.005, h * 0.005, w * 0.99, h * 0.99, r * 0.95);
  ctx.stroke();

  // 3. White cushion border with subtle inner shadow line.
  ctx.lineWidth = w * 0.038;
  ctx.strokeStyle = '#fafafa';
  roundRectPath(ctx, w * 0.058, h * 0.058, w * 0.884, h * 0.884, r * 0.78);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.5, w * 0.003);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  roundRectPath(ctx, w * 0.082, h * 0.082, w * 0.836, h * 0.836, r * 0.65);
  ctx.stroke();

  // 4. Inner panel — clip subsequent ornaments inside the rounded inner area.
  ctx.save();
  roundRectPath(ctx, w * 0.082, h * 0.082, w * 0.836, h * 0.836, r * 0.65);
  ctx.clip();

  // 4a. Faint diagonal weave (every 9% of card width, both directions).
  ctx.strokeStyle = GOLD + '0.10)';
  ctx.lineWidth = Math.max(0.5, w * 0.005);
  const weaveStep = w * 0.09;
  for (let i = -h; i < w + h; i += weaveStep) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
  }

  // 4b. 16-pointed sunburst behind the medallion.
  const burstOuter = w * 0.42;
  const burstInner = w * 0.20;
  const burstGrad = ctx.createRadialGradient(cx, cy, burstInner * 0.4, cx, cy, burstOuter);
  burstGrad.addColorStop(0, GOLD_BRIGHT + '0.20)');
  burstGrad.addColorStop(0.7, GOLD + '0.12)');
  burstGrad.addColorStop(1, GOLD + '0.0)');
  ctx.fillStyle = burstGrad;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a1 = (Math.PI * 2 / 16) * i;
    const a2 = a1 + Math.PI * 2 / 32;
    const a3 = a1 + Math.PI * 2 / 16;
    ctx.lineTo(cx + Math.cos(a1) * burstInner, cy + Math.sin(a1) * burstInner);
    ctx.lineTo(cx + Math.cos(a2) * burstOuter, cy + Math.sin(a2) * burstOuter);
    ctx.lineTo(cx + Math.cos(a3) * burstInner, cy + Math.sin(a3) * burstInner);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // 5. Two thin gold border lines around the play area.
  ctx.lineWidth = Math.max(1, w * 0.007);
  ctx.strokeStyle = GOLD_BRIGHT + '0.65)';
  roundRectPath(ctx, w * 0.115, h * 0.115, w * 0.77, h * 0.77, r * 0.55);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.5, w * 0.003);
  ctx.strokeStyle = GOLD + '0.45)';
  roundRectPath(ctx, w * 0.145, h * 0.145, w * 0.71, h * 0.71, r * 0.50);
  ctx.stroke();

  // 6. Medallion — outer gold ring, mid dark ring, inner radial-fill disc.
  const ringR  = w * 0.255;
  const ring2R = w * 0.235;
  const discR  = w * 0.205;

  // Outer thin-thick double ring (gold).
  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.strokeStyle = GOLD_BRIGHT + '0.85)';
  ctx.beginPath(); ctx.arc(cx, cy, ringR,  0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(0.5, w * 0.003);
  ctx.strokeStyle = GOLD_BRIGHT + '0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, ring2R, 0, Math.PI * 2); ctx.stroke();

  // 12 small dot accents arranged on the outer ring.
  ctx.fillStyle = GOLD_BRIGHT + '0.85)';
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 / 12) * i + Math.PI / 24;
    const dx = cx + Math.cos(a) * (ringR - w * 0.012);
    const dy = cy + Math.sin(a) * (ringR - w * 0.012);
    ctx.beginPath();
    ctx.arc(dx, dy, w * 0.008, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inner gold disc — soft radial highlight from upper-left.
  const discGrad = ctx.createRadialGradient(
    cx - discR * 0.35, cy - discR * 0.4, 0,
    cx, cy, discR * 1.05
  );
  discGrad.addColorStop(0,    '#fef3c7');
  discGrad.addColorStop(0.45, '#f5d27a');
  discGrad.addColorStop(0.85, '#c5972a');
  discGrad.addColorStop(1,    '#7a5b14');
  ctx.fillStyle = discGrad;
  ctx.beginPath(); ctx.arc(cx, cy, discR, 0, Math.PI * 2); ctx.fill();

  // Disc edge — inner highlight + outer dark ring (bevel).
  ctx.lineWidth = Math.max(0.5, w * 0.003);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, discR * 0.94, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, w * 0.005);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, discR, 0, Math.PI * 2); ctx.stroke();

  // 7. LM monogram — bold serif italic in dark forest green.
  ctx.fillStyle = '#0e3a1a';
  ctx.font = `900 italic ${w * 0.22}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LM', cx, cy + w * 0.005);

  // 8. Tagline above and below the medallion (subtle).
  ctx.fillStyle = GOLD_BRIGHT + '0.80)';
  ctx.font = `800 ${w * 0.05}px Georgia, "Times New Roman", serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('★  LOOT  MARKET  ★', cx, h * 0.165);
  ctx.fillText('★  EST · PLAY · WIN  ★', cx, h * 0.835);
}

// ── Canvas wrapper component (high DPI, redraws on resize) ──────────────

function CanvasFace({ id, isBack = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const physW = Math.max(1, Math.round(rect.width * dpr));
      const physH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW;
        canvas.height = physH;
      }
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, physW, physH);
      if (isBack) {
        drawCardBack(ctx, physW, physH);
      } else {
        drawCardFront(ctx, physW, physH, id);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [id, isBack]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
      aria-hidden="true"
    />
  );
}

// ── Main component (3D flip, same API as before) ───────────────────────

export default function PlayingCard({
  id = 0,
  faceUp = false,
  className = '',
  delay = 0,
  size = 'md',
  onClick,
  selected = false,
  dimmed = false,
}) {
  const sizeClass =
    size === 'fill' ? 'w-full' :
    size === 'xs'   ? 'w-[34px] sm:w-[42px] md:w-[48px] lg:w-[56px]' :
    size === 'sm'   ? 'w-[48px] sm:w-[60px]' :
    size === 'lg'   ? 'w-[96px] sm:w-[120px]' :
                      'w-[68px] sm:w-[88px]';

  return (
    <div
      className={`relative ${sizeClass} ${className}`}
      style={{ aspectRatio: '5 / 7', perspective: '1000px' }}
      onClick={onClick}
    >
      <motion.div
        initial={false}
        animate={{ rotateY: faceUp ? 180 : 0 }}
        transition={{ duration: 0.7, ease: [0.4, 0.0, 0.2, 1], delay }}
        className="relative w-full h-full"
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
      >
        {/* Back: at rotateY(0), visible while parent is at 0 (faceUp=false) */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <CanvasFace isBack />
        </div>
        {/* Front: at rotateY(180), visible once parent rotates to 180 (faceUp=true) */}
        <div
          className="absolute inset-0"
          style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <CanvasFace id={id} />
        </div>
      </motion.div>

      {selected && (
        <div
          className="absolute inset-0 rounded-[8%] pointer-events-none"
          style={{ boxShadow: '0 0 0 3px rgba(0, 212, 170, 0.95), 0 0 18px rgba(0, 212, 170, 0.5)' }}
        />
      )}
      {dimmed && (
        <div className="absolute inset-0 rounded-[8%] bg-black/40 pointer-events-none" />
      )}
    </div>
  );
}
