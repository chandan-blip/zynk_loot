import { useEffect, useRef } from 'react';

// Canvas-rendered "Hall of Champions" stage matching the Mutka King visual
// language: pulsing two-tone radial spotlight (gold + accent teal), slow
// rotating conic light streaks, and ✦ sparkle particles over a dark base.
// Three medallions hang from a center gold beam on independently-swinging
// braided ropes. Center medal (#1) is taller and larger.

const RANK_PALETTE = {
  1: {
    label: '1st',
    ringFrom: '#fde68a',
    ringTo:   '#b45309',
    glow:     'rgba(245, 210, 122, 0.85)',
    ribbon:   ['#fbbf24', '#b45309'],
    chipFrom: '#fde047',
    chipTo:   '#b45309',
  },
  2: {
    label: '2nd',
    ringFrom: '#f3f4f6',
    ringTo:   '#6b7280',
    glow:     'rgba(229, 231, 235, 0.65)',
    ribbon:   ['#e5e7eb', '#6b7280'],
    chipFrom: '#f9fafb',
    chipTo:   '#6b7280',
  },
  3: {
    label: '3rd',
    ringFrom: '#fcd34d',
    ringTo:   '#7c2d12',
    glow:     'rgba(180, 83, 9, 0.7)',
    ribbon:   ['#d97706', '#7c2d12'],
    chipFrom: '#fcd34d',
    chipTo:   '#7c2d12',
  },
};

// Match the Mutka King theme exactly
const GOLD = 'rgba(245, 210, 122, 1)';
const ACCENT = 'rgba(0, 212, 170, 1)';

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export default function TopWinnersStage({ winners }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const rafRef = useRef(0);
  const stateRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Build slot order: [#2 left, #1 center, #3 right] but skip missing ones
    const slots = [];
    if (winners[1]) slots.push({ rank: 2, winner: winners[1] });
    if (winners[0]) slots.push({ rank: 1, winner: winners[0] });
    if (winners[2]) slots.push({ rank: 3, winner: winners[2] });

    if (!stateRef.current || stateRef.current.count !== slots.length) {
      const rng = lcg(20260505);
      stateRef.current = {
        count: slots.length,
        pendulums: slots.map(({ rank }) => ({
          rank,
          angle:    (rng() - 0.5) * 0.12,
          velocity: (rng() - 0.5) * 0.18,
          // Slower swing — lower natural frequency means longer period
          freq:     rank === 1 ? 0.55 : 0.45,
          damping:  0.999,
          nextKick: 2 + rng() * 4,
        })),
        // Sparkle particles drifting across the stage like Mutka King
        sparkles: Array.from({ length: 14 }, (_, i) => ({
          x: rng(),
          y: 0.18 + rng() * 0.65,
          size: 6 + rng() * 8,
          delay: rng() * 2.4,
          duration: 2 + rng() * 1.4,
          // Two-tone: gold or accent like Mutka, ~30% white for variety
          color: i % 3 === 0 ? '#f5d27a' : i % 3 === 1 ? '#00d4aa' : '#ffffff',
          rotateSpeed: (rng() - 0.5) * 2,
        })),
        // Sparkles orbiting the gold (#1) medal
        orbitSparkles: Array.from({ length: 16 }, (_, i) => ({
          angle: (i / 16) * Math.PI * 2 + rng() * 0.2,
          radius: 0.55 + (i % 3) * 0.08,
          phase: (i * 0.18) % (Math.PI * 2),
          duration: 1.6 + (i % 3) * 0.4,
        })),
        last: performance.now(),
        t: 0,
      };
    }

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5));

    const resize = () => {
      const w = wrapperRef.current.clientWidth;
      const h = wrapperRef.current.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapperRef.current);

    const draw = (now) => {
      const state = stateRef.current;
      const dt = Math.min(0.05, (now - state.last) / 1000);
      state.last = now;
      state.t += dt;

      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      // Transparent background — just clear and paint glow/decor over whatever
      // the host page provides behind the canvas.
      ctx.clearRect(0, 0, W, H);

      // ── Drifting ✦ sparkle particles ───────────────────────────────────
      ctx.globalCompositeOperation = 'screen';
      for (const sp of state.sparkles) {
        const cycle = (state.t / sp.duration + sp.delay) % 1;
        // Animate opacity up-down and lift y
        const lifeAlpha = Math.max(0, Math.sin(cycle * Math.PI));
        if (lifeAlpha < 0.02) continue;
        const lift = cycle * 22;
        const scaleP = 0.4 + Math.sin(cycle * Math.PI) * 0.9;
        const x = sp.x * W;
        const y = sp.y * H - lift;
        const rotation = state.t * sp.rotateSpeed + cycle * Math.PI;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(scaleP, scaleP);
        ctx.shadowColor = sp.color;
        ctx.shadowBlur = 6;
        ctx.fillStyle = sp.color;
        ctx.globalAlpha = lifeAlpha;
        ctx.font = `900 ${sp.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';

      // Anchor point where ropes hang from (no visible beam, no canvas title)
      const pivotY = Math.max(40, H * 0.14);

      // ── Pendulums ──────────────────────────────────────────────────────
      const usableW = W - 32;
      const weights = state.pendulums.map((p) => (p.rank === 1 ? 1.3 : 1));
      const totalW = weights.reduce((a, b) => a + b, 0);
      const slotXs = [];
      let acc = 16;
      weights.forEach((w) => {
        const slotW = (usableW * w) / totalW;
        slotXs.push(acc + slotW / 2);
        acc += slotW;
      });

      state.pendulums.forEach((p, i) => {
        const accel = -p.freq * p.freq * p.angle;
        p.velocity += accel * dt;
        p.velocity *= p.damping;
        p.angle += p.velocity * dt;
        p.nextKick -= dt;
        if (p.nextKick <= 0) {
          // Smaller, less frequent nudges so the slow swing reads gentle.
          p.velocity += (Math.random() - 0.5) * 0.18;
          p.nextKick = 3 + Math.random() * 4.5;
        }

        const slotCx = slotXs[i];
        const palette = RANK_PALETTE[p.rank];
        const isLead = p.rank === 1;
        const ropeLen = isLead ? Math.min(70, H * 0.22) : Math.min(110, H * 0.36);
        const medalR = isLead ? Math.min(40, W * 0.08) : Math.min(32, W * 0.065);
        const pivotX = slotCx;
        const angle = p.angle;
        const endX = pivotX + Math.sin(angle) * ropeLen;
        const endY = pivotY + Math.cos(angle) * ropeLen;
        const medalCenterX = endX + Math.sin(angle) * (medalR + 8);
        const medalCenterY = endY + Math.cos(angle) * (medalR + 8);

        // Single thin rope — fades transparent at the pivot to solid at the
        // bottom so the line feels like it's emerging from the dark.
        const ropeGrad = ctx.createLinearGradient(pivotX, pivotY, endX, endY);
        ropeGrad.addColorStop(0,   'rgba(180, 150, 110, 0)');
        ropeGrad.addColorStop(0.4, 'rgba(180, 150, 110, 0.35)');
        ropeGrad.addColorStop(1,   'rgba(120, 90, 55, 0.95)');
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = ropeGrad;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Hook ring
        ctx.beginPath();
        ctx.arc(endX, endY, 4, 0, Math.PI * 2);
        const hook = ctx.createRadialGradient(endX - 1, endY - 1, 0, endX, endY, 5);
        hook.addColorStop(0, '#fde68a');
        hook.addColorStop(1, '#7c2d12');
        ctx.fillStyle = hook;
        ctx.fill();

        // Trapezoid ribbon
        ctx.save();
        ctx.translate(endX, endY);
        ctx.rotate(angle);
        const rh = 8;
        const rib = ctx.createLinearGradient(0, 0, 0, rh);
        rib.addColorStop(0, palette.ribbon[0]);
        rib.addColorStop(1, palette.ribbon[1]);
        ctx.fillStyle = rib;
        ctx.beginPath();
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.lineTo(11, rh); ctx.lineTo(-11, rh);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Floor reflection (teal-tinted to echo theme)
        const floorY = pivotY + ropeLen + medalR * 2 + 20;
        const reflectionR = medalR * 1.3;
        const reflectAlpha = 0.55 + Math.sin(state.t * 1.4 + i) * 0.1;
        ctx.globalCompositeOperation = 'screen';
        const refGrad = ctx.createRadialGradient(slotCx, floorY, 0, slotCx, floorY, reflectionR);
        refGrad.addColorStop(0, `rgba(245,210,122,${0.32 * reflectAlpha})`);
        refGrad.addColorStop(0.5, `rgba(0,212,170,${0.18 * reflectAlpha})`);
        refGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = refGrad;
        ctx.beginPath();
        ctx.ellipse(slotCx, floorY, reflectionR, reflectionR * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // Medallion outer breathing glow
        const breath = 0.9 + Math.sin(state.t * 2 + i * 0.8) * 0.15;
        ctx.globalCompositeOperation = 'screen';
        const outer = ctx.createRadialGradient(medalCenterX, medalCenterY, medalR * 0.6, medalCenterX, medalCenterY, medalR * 2.4 * breath);
        outer.addColorStop(0,   palette.glow);
        outer.addColorStop(0.6, palette.glow.replace(/[\d.]+\)/, '0.25)'));
        outer.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = outer;
        ctx.beginPath();
        ctx.arc(medalCenterX, medalCenterY, medalR * 2.4 * breath, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // Medallion body
        const body = ctx.createRadialGradient(
          medalCenterX - medalR * 0.35, medalCenterY - medalR * 0.4, 2,
          medalCenterX, medalCenterY, medalR
        );
        body.addColorStop(0, palette.ringFrom);
        body.addColorStop(0.55, palette.ringFrom);
        body.addColorStop(1, palette.ringTo);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(medalCenterX, medalCenterY, medalR, 0, Math.PI * 2);
        ctx.fill();

        // Engraved highlight arcs — slowly rotate so the rim catches light
        ctx.lineWidth = 2;
        for (let arc = 0; arc < 4; arc++) {
          const start = arc * Math.PI * 0.5 + state.t * 0.4;
          const end = start + Math.PI * 0.32;
          ctx.strokeStyle = arc % 2 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.arc(medalCenterX, medalCenterY, medalR - 4, start, end);
          ctx.stroke();
        }

        // Inner disc
        const innerR = medalR - 9;
        const inner = ctx.createRadialGradient(
          medalCenterX - innerR * 0.3, medalCenterY - innerR * 0.4, 1,
          medalCenterX, medalCenterY, innerR
        );
        inner.addColorStop(0, 'rgba(255,255,255,0.18)');
        inner.addColorStop(0.5, 'rgba(20,15,10,0.85)');
        inner.addColorStop(1, 'rgba(10,7,5,0.95)');
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.arc(medalCenterX, medalCenterY, innerR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(medalCenterX, medalCenterY, innerR, 0, Math.PI * 2);
        ctx.stroke();

        // Diagonal shine sweep clipped to the inner disc
        ctx.save();
        ctx.beginPath();
        ctx.arc(medalCenterX, medalCenterY, innerR - 1, 0, Math.PI * 2);
        ctx.clip();
        const sweepX = medalCenterX - innerR + ((state.t * (40 + i * 12)) % (innerR * 2.4));
        const sweep = ctx.createLinearGradient(sweepX - 14, 0, sweepX + 14, 0);
        sweep.addColorStop(0, 'rgba(255,255,255,0)');
        sweep.addColorStop(0.5, 'rgba(255,255,255,0.4)');
        sweep.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sweep;
        ctx.fillRect(medalCenterX - innerR, medalCenterY - innerR, innerR * 2, innerR * 2);
        ctx.restore();

        // Initial letter
        const winner = winners[p.rank === 1 ? 0 : p.rank === 2 ? 1 : 2];
        const initial = (winner?.username?.[0] || 'W').toUpperCase();
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${Math.floor(innerR * 1.05)}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = palette.glow;
        ctx.shadowBlur = 8;
        ctx.fillText(initial, medalCenterX, medalCenterY + 1);
        ctx.shadowBlur = 0;

        // Orbiting ✦ sparkles around #1 (two-tone like Mutka)
        if (isLead) {
          ctx.globalCompositeOperation = 'screen';
          state.orbitSparkles.forEach((sp, sIdx) => {
            const a = sp.angle + state.t * 0.4;
            const sx = medalCenterX + Math.cos(a) * medalR * (1.05 + sp.radius * 0.4);
            const sy = medalCenterY + Math.sin(a) * medalR * (1.05 + sp.radius * 0.4);
            const phase = (state.t / sp.duration + sp.phase) % 1;
            const lifeAlpha = Math.max(0, Math.sin(phase * Math.PI));
            const color = sIdx % 3 === 0 ? '#f5d27a' : sIdx % 3 === 1 ? '#00d4aa' : '#ffffff';
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(state.t * (sIdx % 2 === 0 ? 1 : -1) + sp.phase);
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
            ctx.fillStyle = color;
            ctx.globalAlpha = lifeAlpha;
            ctx.font = `900 ${6 + lifeAlpha * 6}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✦', 0, 0);
            ctx.restore();
          });
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
          ctx.globalCompositeOperation = 'source-over';

          // Crown above
          ctx.font = `${Math.floor(medalR * 0.95)}px serif`;
          ctx.shadowColor = 'rgba(245,210,122,0.7)';
          ctx.shadowBlur = 12;
          ctx.fillStyle = '#fff';
          ctx.fillText('👑', medalCenterX, medalCenterY - medalR - 18);
          ctx.shadowBlur = 0;
        }

        // Rank badge
        const badgeY = medalCenterY - medalR - 8;
        const badgeW = 28, badgeH = 14;
        const badgeGrad = ctx.createLinearGradient(medalCenterX - badgeW / 2, badgeY, medalCenterX + badgeW / 2, badgeY + badgeH);
        badgeGrad.addColorStop(0, palette.chipFrom);
        badgeGrad.addColorStop(1, palette.chipTo);
        ctx.fillStyle = badgeGrad;
        roundRect(ctx, medalCenterX - badgeW / 2, badgeY, badgeW, badgeH, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.fillStyle = '#1a0e02';
        ctx.font = '900 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(palette.label, medalCenterX, badgeY + badgeH / 2 + 1);

        // Username + prize plaque
        const labelY = floorY + 18;
        ctx.fillStyle = '#fde68a';
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        const name = (winner?.username || '—');
        const trimmed = name.length > 16 ? name.slice(0, 15) + '…' : name;
        ctx.fillText(trimmed, slotCx, labelY);
        ctx.fillStyle = '#a7f3d0';
        ctx.font = '900 13px system-ui, sans-serif';
        ctx.fillText(
          `₹${Number(winner?.prize || 0).toLocaleString('en-IN')}`,
          slotCx,
          labelY + 16
        );
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [winners]);

  if (!winners || winners.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative w-full" style={{ height: 280 }}>
      <canvas ref={canvasRef} className="block w-full h-full rounded-2xl" />
    </div>
  );
}

function roundRect(ctx, x, y, w, h, r) {
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
