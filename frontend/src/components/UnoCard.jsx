import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// 54-card UNO deck (game-side encoding):
//   ids 0..51 = colored cards (4 colors × 13 ranks)
//     myColor = floor(id/13)  0=Red, 1=Yellow, 2=Green, 3=Blue
//     myRank  = id % 13       0..9 = numbers,  10=Skip, 11=Reverse, 12=+2
//   id 52 = Wild,  id 53 = Wild Draw Four
//
// We render every card by cropping the canonical UNO sprite sheet
// (`/uno-classic.png`, 2048×2048) onto a canvas at devicePixelRatio so
// it stays crisp at every size. The sprite layout was determined empirically
// from the source PNG:
//   • 6 rows × 12 cols, each card 165×256 px, ~5 px gaps between
//   • Row Y origins: 0, 258, 517, 775, 1034, 1292
//   • Col X stride: 170 px
//   • Row 0 holds wild/special cards. Within each colored stripe, card order
//     is 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, +2, Reverse, Skip.
//   • Sprite colour order: yellow, red, blue, green.

const SPRITE_SRC = '/uno-classic.png';
const ROW_Y = [0, 258, 517, 775, 1034, 1292];
// Exact left-edge X for each of the 12 columns (irregular by 1-3 px).
const COL_X = [0, 167, 335, 502, 670, 837, 1005, 1175, 1342, 1510, 1677, 1845];
const CARD_W = 165;
const CARD_H = 256;

// Where in the sprite is each "special" card (row 0 indices)
const SPRITE_WILD_IDX = 1;       // Wild
const SPRITE_WILD_FOUR_IDX = 6;  // Wild Draw Four

// myColor (0=Red,1=Yellow,2=Green,3=Blue) → sprite colour stripe (0=Y,1=R,2=B,3=G)
const MY_COLOR_TO_SPRITE_STRIPE = { 0: 1, 1: 0, 2: 3, 3: 2 };

// myRank → slot within the colour stripe.
// Sprite stripe order: 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, +2, Skip, Reverse.
function myRankToSpriteSlot(myRank) {
  if (myRank === 0)  return 9;   // 0
  if (myRank <= 9)   return myRank - 1; // 1..9 → slot 0..8
  if (myRank === 10) return 11;  // Skip
  if (myRank === 11) return 12;  // Reverse
  if (myRank === 12) return 10;  // +2
  return 0;
}

function spritePosFromIdx(idx) {
  const col = idx % 12;
  const row = Math.floor(idx / 12);
  return { sx: COL_X[col], sy: ROW_Y[row], sw: CARD_W, sh: CARD_H };
}

function spritePosForCard(id) {
  if (id === 52) return spritePosFromIdx(SPRITE_WILD_IDX);
  if (id === 53) return spritePosFromIdx(SPRITE_WILD_FOUR_IDX);
  const myColor = Math.floor(id / 13);
  const myRank = id % 13;
  const stripe = MY_COLOR_TO_SPRITE_STRIPE[myColor];
  const slot = myRankToSpriteSlot(myRank);
  const idx = 12 + stripe * 13 + slot;
  return spritePosFromIdx(idx);
}

// ── Public helpers (kept compatible with previous API) ───────────────────

export const UNO_COLORS = [
  { id: 0, name: 'red',    label: 'Red',    main: '#dc2626', dark: '#7f1d1d' },
  { id: 1, name: 'yellow', label: 'Yellow', main: '#f5c518', dark: '#854d0e' },
  { id: 2, name: 'green',  label: 'Green',  main: '#16a34a', dark: '#14532d' },
  { id: 3, name: 'blue',   label: 'Blue',   main: '#2563eb', dark: '#1e3a8a' },
];

export const UNO_RANK_LABELS = ['0','1','2','3','4','5','6','7','8','9','Skip','Reverse','+2'];

export function decodeUnoCard(id) {
  if (id >= 52) {
    return { id, isWild: true, kind: id === 53 ? 'wild_plus_four' : 'wild', label: id === 53 ? '+4' : 'Wild' };
  }
  const color = UNO_COLORS[Math.floor(id / 13)];
  const rankIdx = id % 13;
  const isAction = rankIdx >= 10;
  const action = isAction ? ['skip','reverse','draw_two'][rankIdx - 10] : null;
  return { id, isWild: false, color, rankIdx, isAction, action, label: UNO_RANK_LABELS[rankIdx] };
}

// Tiny SVG pip used by the bet-side picker chips (still drawn programmatically
// since it's an icon, not the full card art).
export function UnoRankSymbol({ rankIdx, color = '#0a0a0a', size = 32 }) {
  const sw = Math.max(2, size * 0.12);
  if (rankIdx <= 9) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
        <text
          x="50" y="78" textAnchor="middle"
          fontFamily='"Arial Black", "Helvetica Neue", Arial, sans-serif'
          fontWeight="900" fontSize="92" fontStyle="italic"
          transform="skewX(-15)" style={{ transformOrigin: '50px 50px' }}
          fill={color}
        >
          {rankIdx}
        </text>
      </svg>
    );
  }
  if (rankIdx === 10) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth={sw * 1.5} />
        <line x1="22" y1="78" x2="78" y2="22" stroke={color} strokeWidth={sw * 1.5} strokeLinecap="round" />
      </svg>
    );
  }
  if (rankIdx === 11) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
        <path d="M 14 38 Q 50 18 80 38 L 80 30 L 92 44 L 80 56 L 80 48 Q 50 32 18 50 Z" fill={color} />
        <path d="M 86 62 Q 50 82 20 62 L 20 70 L 8 56 L 20 44 L 20 52 Q 50 68 82 50 Z" fill={color} />
      </svg>
    );
  }
  if (rankIdx === 12) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
        <text
          x="50" y="78" textAnchor="middle"
          fontFamily='"Arial Black", "Helvetica Neue", Arial, sans-serif'
          fontWeight="900" fontSize="78" fontStyle="italic"
          transform="skewX(-15)" style={{ transformOrigin: '50px 50px' }}
          fill={color}
        >
          +2
        </text>
      </svg>
    );
  }
  return null;
}

// ── Custom green-themed card back, drawn directly to canvas ─────────────

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

function drawGreenCardBack(ctx, w, h) {
  const r = w * 0.08;
  const cx = w / 2, cy = h / 2;
  const GOLD = 'rgba(229,193,108,';
  const GOLD_BRIGHT = 'rgba(245,210,122,';

  // 1. Deep emerald with centred radial highlight.
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

  // 3. White cushion border + dark hairline.
  ctx.lineWidth = w * 0.038;
  ctx.strokeStyle = '#fafafa';
  roundRectPath(ctx, w * 0.058, h * 0.058, w * 0.884, h * 0.884, r * 0.78);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.5, w * 0.003);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  roundRectPath(ctx, w * 0.082, h * 0.082, w * 0.836, h * 0.836, r * 0.65);
  ctx.stroke();

  // 4. Inner ornaments — clipped to rounded inner area.
  ctx.save();
  roundRectPath(ctx, w * 0.082, h * 0.082, w * 0.836, h * 0.836, r * 0.65);
  ctx.clip();

  // Diagonal weave.
  ctx.strokeStyle = GOLD + '0.10)';
  ctx.lineWidth = Math.max(0.5, w * 0.005);
  const weaveStep = w * 0.09;
  for (let i = -h; i < w + h; i += weaveStep) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
  }

  // 16-pointed sunburst behind medallion.
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

  // 6. Medallion — outer/inner gold rings, dot accents, inner gradient disc.
  const ringR  = w * 0.255;
  const ring2R = w * 0.235;
  const discR  = w * 0.205;

  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.strokeStyle = GOLD_BRIGHT + '0.85)';
  ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(0.5, w * 0.003);
  ctx.strokeStyle = GOLD_BRIGHT + '0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, ring2R, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = GOLD_BRIGHT + '0.85)';
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 / 12) * i + Math.PI / 24;
    const dx = cx + Math.cos(a) * (ringR - w * 0.012);
    const dy = cy + Math.sin(a) * (ringR - w * 0.012);
    ctx.beginPath();
    ctx.arc(dx, dy, w * 0.008, 0, Math.PI * 2);
    ctx.fill();
  }

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

  ctx.lineWidth = Math.max(0.5, w * 0.003);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, discR * 0.94, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, w * 0.005);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, discR, 0, Math.PI * 2); ctx.stroke();

  // 7. LM monogram.
  ctx.fillStyle = '#0e3a1a';
  ctx.font = `900 italic ${w * 0.22}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LM', cx, cy + w * 0.005);

  // 8. Top + bottom tagline.
  ctx.fillStyle = GOLD_BRIGHT + '0.80)';
  ctx.font = `800 ${w * 0.05}px Georgia, "Times New Roman", serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('★  LOOT  MARKET  ★', cx, h * 0.165);
  ctx.fillText('★  EST · PLAY · WIN  ★', cx, h * 0.835);
}

function GreenBackCanvas() {
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
      drawGreenCardBack(ctx, physW, physH);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
      aria-hidden="true"
    />
  );
}

// ── Sprite loader (singleton, cached across all card instances) ──────────

let spritePromise = null;
function loadSprite() {
  if (spritePromise) return spritePromise;
  spritePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = SPRITE_SRC;
  });
  return spritePromise;
}

// ── Sprite-cropped canvas face (high DPI) ────────────────────────────────

function SpriteCanvas({ pos, faceClassName = '' }) {
  const canvasRef = useRef(null);
  const [sprite, setSprite] = useState(null);

  useEffect(() => {
    let alive = true;
    loadSprite().then((img) => { if (alive) setSprite(img); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;

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
      ctx.drawImage(sprite, pos.sx, pos.sy, pos.sw, pos.sh, 0, 0, physW, physH);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [sprite, pos.sx, pos.sy, pos.sw, pos.sh]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${faceClassName}`}
      style={{ display: 'block' }}
      aria-hidden="true"
    />
  );
}

// Front face of any card (id 0..53)
function UnoCardFace({ id }) {
  const pos = spritePosForCard(id);
  return <SpriteCanvas pos={pos} />;
}

// Back face — emerald medallion (custom canvas, no sprite).
// Sits at default orientation (rotateY 0): visible while parent is at 0
// (faceUp=false); parent flipping to 180 hides it via backface-visibility.
function UnoCardBack() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
    >
      <GreenBackCanvas />
    </div>
  );
}

/**
 * UNO playing card with realistic 3D flip animation, rendered from the
 * canonical UNO classic sprite sheet onto a high-DPI canvas.
 */
export default function UnoCard({
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
        <UnoCardBack />
        <div
          className="absolute inset-0"
          style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <UnoCardFace id={id} />
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
