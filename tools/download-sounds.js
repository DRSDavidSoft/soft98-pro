"use strict";

const { cues } = require("../src/download-audio");
const RATE = 24000;
// MIDI pitch, offset, duration and relative gain. Short lower cues are reversible
// actions; the longer two-note phrases signal an outcome.
const phrases = {
  queued: [[62, 0, 108, 0.29], [67, 65, 126, 0.28]],
  started: [[67, 0, 116, 0.36], [76, 72, 134, 0.39]],
  paused: [[69, 0, 116, 0.36], [64, 75, 134, 0.32]],
  resumed: [[64, 0, 112, 0.31], [69, 72, 150, 0.38]],
  canceled: [[64, 0, 103, 0.35], [57, 74, 152, 0.27]],
  complete: [[67, 0, 190, 0.43], [74, 102, 181, 0.39], [79, 198, 249, 0.42]],
  attention: [[69, 0, 175, 0.40], [66, 147, 246, 0.39]],
};

function wave(notes) {
  const frame = (ms) => RATE * ms / 1000;
  const length = frame(Math.max(...notes.map(([, offset, duration]) => offset + duration)) + 12);
  const samples = new Float64Array(length);
  for (const [pitch, offset, duration, gain] of notes) {
    const step = 2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) / RATE;
    const frames = frame(duration);
    for (let i = 0; i < frames; i++) {
      const progress = i / frames;
      const attack = Math.min(1, i / frame(10));
      const envelope = Math.sin(attack * Math.PI / 2) ** 2 * (1 - progress) ** 2;
      const phase = step * i;
      const tone = 0.84 * Math.sin(phase) + 0.13 * (1 - progress) * Math.sin(2 * phase) + 0.03 * Math.sin(3 * phase);
      samples[frame(offset) + i] += tone * envelope * gain;
    }
  }

  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // Mono PCM
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(length * 2, 40);
  samples.forEach((sample, i) => buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2));
  return buffer;
}

function downloadSounds() {
  return cues.map((cue) => [`${cue}.wav`, wave(phrases[cue])]);
}

module.exports = { downloadSounds };
