// Deterministically generates original effects for Surface Defense.
// No samples or audio files from the classic game or reference repositories are used.

import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 44100;
const OUTPUT_DIR = path.resolve('assets/surface-defense/sounds');

function seededNoise(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return (value / 0xffffffff) * 2 - 1;
  };
}

function envelope(time, duration, attack = 0.01, release = 0.2) {
  const fadeIn = Math.min(1, time / attack);
  const fadeOut = Math.min(1, (duration - time) / release);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

function writeWave(name, duration, sampleFn) {
  const sampleCount = Math.floor(SAMPLE_RATE * duration);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < sampleCount; i++) {
    const time = i / SAMPLE_RATE;
    const sample = Math.max(-1, Math.min(1, sampleFn(time, duration)));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, name), buffer);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Ignition blast into a rumbling exhaust tail: a broadband crack whose highs
// decay fast, over a low thump and a sustained low-passed exhaust roar.
writeWave('launch.wav', 1.1, (() => {
  const noise = seededNoise(814);
  let lowpass1 = 0;
  let lowpass2 = 0;
  return (time, duration) => {
    const raw = noise();
    lowpass1 += (raw - lowpass1) * 0.08;
    lowpass2 += (lowpass1 - lowpass2) * 0.08;
    const crack = raw * Math.exp(-time * 14) * 0.6;
    const exhaust = lowpass2 * 3.4 * Math.exp(-time * 2.2);
    const thump = Math.sin(Math.PI * 2 * (95 - time * 40) * time) * Math.exp(-time * 4) * 0.5;
    return (crack + exhaust + thump) * 0.72 * envelope(time, duration, 0.004, 0.3);
  };
})());

// Sharp full-spectrum crack decaying into a long, crackling low rumble.
writeWave('airburst.wav', 2.4, (() => {
  const noise = seededNoise(2117);
  let lowpass1 = 0;
  let lowpass2 = 0;
  let slow = 0;
  return (time, duration) => {
    const raw = noise();
    lowpass1 += (raw - lowpass1) * 0.05;
    lowpass2 += (lowpass1 - lowpass2) * 0.05;
    slow += (raw - slow) * 0.004;
    const crack = raw * Math.exp(-time * 16) * 0.7;
    const body = lowpass2 * 3.8 * Math.exp(-time * 1.6);
    const rumble = (Math.sin(Math.PI * 2 * 52 * time) * 0.5 +
      Math.sin(Math.PI * 2 * 104 * time) * 0.22) *
      (0.55 + slow * 3) * Math.exp(-time * 1.1);
    return (crack + body + rumble * 0.7) * 0.72 * envelope(time, duration, 0.002, 0.7);
  };
})());

writeWave('ground-impact.wav', 0.95, (() => {
  const noise = seededNoise(2600);
  return (time, duration) => {
    const low = Math.sin(Math.PI * 2 * (58 - time * 24) * time);
    const rumble = noise() * 0.45 * Math.exp(-time * 3.2);
    return (low * 0.68 + rumble) * envelope(time, duration, 0.002, 0.45);
  };
})());

// Soft low lead-in, then a repeating descending air-raid chirp.
writeWave('wave-start.wav', 3.2, (time, duration) => {
  const leadIn = time < 0.6
    ? Math.sin(Math.PI * 2 * 110 * time) * 0.28 * Math.min(1, time / 0.3)
    : 0;
  if (time < 0.6) return leadIn * envelope(time, duration, 0.05, 0.4);

  const cycleLength = 0.3;
  const cycleTime = (time - 0.6) % cycleLength;
  const phase = cycleTime / cycleLength;
  const frequency = 1350 - phase * 820;
  const fundamental = Math.sin(Math.PI * 2 * frequency * cycleTime);
  const harmonic2 = Math.sin(Math.PI * 2 * frequency * 2 * cycleTime) * 0.3;
  const harmonic3 = Math.sin(Math.PI * 2 * frequency * 3 * cycleTime) * 0.14;
  const chirpEnv = Math.min(1, cycleTime / 0.01) * (1 - phase * 0.35);
  return (fundamental + harmonic2 + harmonic3) * 0.34 * chirpEnv *
    envelope(time, duration, 0.05, 0.5);
});

writeWave('bonus-city.wav', 0.9, (time, duration) => {
  const notes = [440, 554, 660, 880, 1108];
  const note = notes[Math.min(notes.length - 1, Math.floor(time / (duration / notes.length)))];
  const tone = Math.sin(Math.PI * 2 * note * time);
  const sparkle = Math.sin(Math.PI * 2 * note * 2 * time) * 0.22;
  return (tone * 0.46 + sparkle) * envelope(time, duration, 0.008, 0.1);
});

writeWave('aircraft-alert.wav', 0.55, (time, duration) => {
  const frequency = Math.floor(time * 12) % 2 === 0 ? 720 : 520;
  return Math.sign(Math.sin(Math.PI * 2 * frequency * time)) * 0.24 *
    envelope(time, duration, 0.004, 0.08);
});

// Harsh two-tone denial buzzer that alternates pitch, then cuts off hard.
writeWave('no-ammo.wav', 0.36, (time, duration) => {
  if (time > 0.3) return 0;
  const highTone = Math.floor(time / 0.075) % 2 === 0;
  const frequency = highTone ? 150 : 98;
  const buzz = Math.sign(Math.sin(Math.PI * 2 * frequency * time));
  const edge = Math.sign(Math.sin(Math.PI * 2 * frequency * 3 * time)) * 0.28;
  return (buzz + edge) * 0.2 * envelope(time, 0.3, 0.003, 0.02);
});

// Long, low devastation rumble that swells and breaks into descending doom
// sweeps before fading out.
writeWave('game-over.wav', 4.6, (() => {
  const noise = seededNoise(3391);
  let lowpass1 = 0;
  let lowpass2 = 0;
  let slow = 0;
  return (time, duration) => {
    const raw = noise();
    lowpass1 += (raw - lowpass1) * 0.03;
    lowpass2 += (lowpass1 - lowpass2) * 0.03;
    slow += (raw - slow) * 0.002;
    const wobble = 0.6 + 0.4 * Math.sin(Math.PI * 2 * 2.6 * time);
    const rumble = (lowpass2 * 4.2 + Math.sin(Math.PI * 2 * 46 * time) * 0.4) *
      wobble * (0.75 + slow * 2);
    let sweep = 0;
    if (time > 2.8) {
      const sweepTime = (time - 2.8) % 0.6;
      const sweepFreq = 360 - (sweepTime / 0.6) * 280;
      sweep = Math.sin(Math.PI * 2 * sweepFreq * sweepTime) *
        0.3 * (1 - (time - 2.8) / (duration - 2.8));
    }
    return (rumble * 0.55 + sweep) * envelope(time, duration, 0.3, 1.4);
  };
})());
