import { describe, it, expect } from 'vitest';
import { parseHeartRate } from './bleHeartRate';

// Construye un paquete Heart Rate Measurement (GATT 0x2A37) a mano para
// verificar el parseo de flags — base de que las bandas "de todo tipo" que
// va a usar Dani se lean bien, y de que se detecte cuándo hay RR (§F1/F8).
function packet(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('parseHeartRate', () => {
  it('BPM en uint8 cuando flag bit0=0', () => {
    const { bpm, rrIntervals } = parseHeartRate(packet([0x00, 72]));
    expect(bpm).toBe(72);
    expect(rrIntervals).toBeUndefined();
  });

  it('BPM en uint16 little-endian cuando flag bit0=1', () => {
    // 300 bpm = 0x012C → LE: 0x2C, 0x01
    const { bpm } = parseHeartRate(packet([0x01, 0x2c, 0x01]));
    expect(bpm).toBe(300);
  });

  it('se salta Energy Expended (bit3) antes de leer los RR', () => {
    // flags: bit0=0 (uint8 bpm), bit3=1 (energy), bit4=1 (RR)
    // bpm=80, energy=500 (0x01F4 LE: F4 01), RR=1024 (1s, LE: 00 04)
    const flags = 0b00011000;
    const { bpm, rrIntervals } = parseHeartRate(packet([flags, 80, 0xf4, 0x01, 0x00, 0x04]));
    expect(bpm).toBe(80);
    expect(rrIntervals).toEqual([1000]); // 1024 * 1000/1024 = 1000ms
  });

  it('sin bit4, no hay rrIntervals (banda que no expone RR — no todas lo hacen)', () => {
    const { rrIntervals } = parseHeartRate(packet([0x00, 65]));
    expect(rrIntervals).toBeUndefined();
  });

  it('puede traer varios RR en un mismo paquete', () => {
    const flags = 0b00010000; // solo bit4 (RR), uint8 bpm
    // dos RR de 1024 unidades (1000ms) cada uno
    const { rrIntervals } = parseHeartRate(packet([flags, 70, 0x00, 0x04, 0x00, 0x04]));
    expect(rrIntervals).toEqual([1000, 1000]);
  });
});
