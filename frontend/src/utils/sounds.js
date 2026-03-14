// Web Audio API sound effects — import and use anywhere
// Usage: import { sounds } from '../utils/sounds';  sounds.click();

const getCtx = () => new (window.AudioContext || window.webkitAudioContext)();

const play = (fn) => {
  try { fn(); } catch {}
};

// Cubic bezier helpers for syncing sounds to animation easings
const bz = (t, p1, p2) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;

// Find wall-clock time fraction for a given animation progress via bezier inverse
const timeAt = (progress, x1, y1, x2, y2) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    bz(mid, y1, y2) < progress ? (lo = mid) : (hi = mid);
  }
  return bz((lo + hi) / 2, x1, x2);
};

const EASE_IN_OUT = [0.42, 0, 0.58, 1];

export const sounds = {
  // Soft subtle tap — for nav, amount select, general UI buttons
  tap() {
    play(() => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    });
  },

  // Slightly stronger click — for game actions, bet confirm
  click() {
    play(() => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    });
  },

  // Coin flip — tick at each face change, synced to rotateY:[0,1800] easeInOut 1.5s
  // 1800° = 10 half-rotations, tick every 180° (heads→tails→heads...)
  flip() {
    play(() => {
      const ctx = getCtx();
      const totalDeg = 1800;
      const step = 180;
      const ticks = totalDeg / step; // 10
      const duration = 1.5;

      for (let i = 1; i < ticks; i++) {
        const progress = i / ticks;
        const tf = timeAt(progress, ...EASE_IN_OUT);
        const t = ctx.currentTime + tf * duration;

        // easeInOut: fastest in middle, slowest at edges
        const speed = Math.sin(progress * Math.PI);

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        // High pitch when fast, lower when slow
        osc.frequency.setValueAtTime(800 + speed * 600, t);
        gain.gain.setValueAtTime(0.06 + speed * 0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      }
    });
  },

  // Dice roll — tumble impacts synced to rotate:[0,360,720] easeInOut 1.2s
  // Two 360° segments (0.6s each), tick every 90° (face landing) = 8 ticks
  dice() {
    play(() => {
      const ctx = getCtx();
      const segDuration = 0.6;
      const ticksPerSeg = 4; // 90° per tick

      for (let seg = 0; seg < 2; seg++) {
        for (let i = 1; i <= ticksPerSeg; i++) {
          const progress = i / ticksPerSeg;
          const tf = timeAt(Math.min(progress, 0.999), ...EASE_IN_OUT);
          const t = ctx.currentTime + seg * segDuration + tf * segDuration;

          const speed = Math.sin(progress * Math.PI);

          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'square';
          // Tumble pitch varies with speed + slight randomness
          osc.frequency.setValueAtTime(250 + speed * 150 + Math.random() * 50, t);
          gain.gain.setValueAtTime(0.04 + speed * 0.04, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          osc.start(t);
          osc.stop(t + 0.05);
        }
      }
    });
  },

  // Wheel spin — tick at every segment crossing, synced to actual rotation
  // Called with totalDegrees from the component so ticks match the exact animation
  spinSync(totalDegrees, durationSec = 4, easing = [0.15, 0.85, 0.25, 1]) {
    play(() => {
      const ctx = getCtx();
      const segmentAngle = 45; // 360 / 8 segments
      const numTicks = Math.floor(totalDegrees / segmentAngle);
      if (numTicks <= 0) return;

      for (let i = 1; i <= numTicks; i++) {
        const progress = (i * segmentAngle) / totalDegrees;
        if (progress >= 1) break;

        const tf = timeAt(progress, ...easing);
        const t = ctx.currentTime + tf * durationSec;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        // Fast ticks = high pitch & quiet, slow ticks near end = lower & louder
        osc.frequency.setValueAtTime(500 + (1 - progress) * 500, t);
        gain.gain.setValueAtTime(0.05 + progress * 0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.start(t);
        osc.stop(t + 0.04);
      }
    });
  },

  // Balloon inflate — rising tension tone synced to inflation duration
  inflate(durationSec = 3) {
    play(() => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + durationSec);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + durationSec);
      osc.start();
      osc.stop(ctx.currentTime + durationSec);
    });
  },

  // Balloon pop — sharp noise burst
  pop() {
    play(() => {
      const ctx = getCtx();
      const bufferSize = Math.floor(ctx.sampleRate * 0.15);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = ctx.createGain();
      noise.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      noise.start();
      noise.stop(ctx.currentTime + 0.15);
    });
  },

  // Cash out success — quick ascending cha-ching
  cashout() {
    play(() => {
      const ctx = getCtx();
      const notes = [880, 1108, 1320];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.08;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    });
  },

  // Door creak — short creak for opening a tower door
  doorReveal() {
    play(() => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    });
  },

  // Floor cleared — short ascending chime
  floorClear() {
    play(() => {
      const ctx = getCtx();
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.1;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    });
  },

  // Dragon roar — low rumbling failure
  dragonRoar() {
    play(() => {
      const ctx = getCtx();
      // Low rumble
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      // Growl layer
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(120, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.4);
      gain2.gain.setValueAtTime(0.08, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.4);
    });
  },

  // Ice step — crunchy footstep on ice
  iceStep() {
    play(() => {
      const ctx = getCtx();
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2000, ctx.currentTime);
      const gain = ctx.createGain();
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      noise.start();
      noise.stop(ctx.currentTime + 0.08);
    });
  },

  // Ice crack — shattering crack with low rumble
  iceCrack() {
    play(() => {
      const ctx = getCtx();
      // Sharp crack
      const bufferSize = Math.floor(ctx.sampleRate * 0.3);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = ctx.createGain();
      noise.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      noise.start();
      noise.stop(ctx.currentTime + 0.3);
      // Low rumble
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
      oscGain.gain.setValueAtTime(0.1, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    });
  },

  // Arrow whoosh — rising bandpass noise
  arrowShoot() {
    play(() => {
      const ctx = getCtx();
      const bufferSize = Math.floor(ctx.sampleRate * 0.35);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(i / bufferSize, 0.5) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.3);
      filter.Q.setValueAtTime(2, ctx.currentTime);
      const gain = ctx.createGain();
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      noise.start();
      noise.stop(ctx.currentTime + 0.35);
    });
  },

  // Arrow thud — impact on target
  arrowHit() {
    play(() => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    });
  },

  // Egg crack — sharp short crack
  eggCrack() {
    play(() => {
      const ctx = getCtx();
      const bufferSize = Math.floor(ctx.sampleRate * 0.1);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 4);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1500, ctx.currentTime);
      const gain = ctx.createGain();
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      noise.start();
      noise.stop(ctx.currentTime + 0.1);
    });
  },

  win() {
    play(() => {
      const ctx = getCtx();
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.12;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    });
  },

  lose() {
    play(() => {
      const ctx = getCtx();
      const notes = [400, 350, 300];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        const t = ctx.currentTime + i * 0.18;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    });
  },
};
