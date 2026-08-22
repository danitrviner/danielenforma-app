import { Capacitor } from '@capacitor/core';
import { BleClient, BleDevice } from '@capacitor-community/bluetooth-le';

// Heart Rate Service estándar Bluetooth SIG — soportado por cualquier banda
// de pecho/brazo (Polar H10, Coospo, Wahoo, Garmin HRM...). §4.2 del plan.
const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

// Reconexión: la banda se despega, se queda sin pila un instante o pierde el
// enlace. Eso NO debe terminar la sesión (§F1 del plan) — se reintenta con
// backoff mientras el atleta sigue entrenando.
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const MAX_RECONNECT_ATTEMPTS = 30; // ≈7 min reintentando antes de rendirse

export type HeartRateStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface HeartRateSample {
  bpm: number;
  /** Intervalos RR en ms. Solo si la banda los expone (bit 4 de flags). */
  rrIntervals?: number[];
  /** Date.now() de la recepción — el tiempo por zona se acumula con esto. */
  at: number;
}

const SIMULATE_STORAGE_KEY = 'enforma:simulateBle';

// Solo para probar en el navegador el flujo completo de una sesión de
// cardio (zonas, resumen final...) sin banda real ni build nativo. Se activa
// visitando la app con ?simulateBle=1 (se recuerda en localStorage) y solo
// funciona en dev — nunca en producción, aunque alguien adivine el parámetro.
export function isBleSimulated(): boolean {
  if (!import.meta.env.DEV) return false;
  return localStorage.getItem(SIMULATE_STORAGE_KEY) === '1';
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  if (params.get('simulateBle') === '1') localStorage.setItem(SIMULATE_STORAGE_KEY, '1');
  else if (params.get('simulateBle') === '0') localStorage.removeItem(SIMULATE_STORAGE_KEY);
}

export function isBleAvailable(): boolean {
  return Capacitor.isNativePlatform() || isBleSimulated();
}

/**
 * Parsea el formato estándar Heart Rate Measurement (GATT 0x2A37).
 *
 * byte 0 = flags:
 *   bit 0 → 0 = BPM en uint8, 1 = BPM en uint16
 *   bit 3 → hay Energy Expended (uint16) que hay que saltarse
 *   bit 4 → hay intervalos RR (uint16[], en unidades de 1/1024 s)
 *
 * Los RR son la materia prima del HRV. No todas las bandas los mandan
 * (Polar H10 sí, muchas baratas no), por eso el campo es opcional y quien
 * consume debe comprobarlo — Dani usará bandas de todo tipo.
 */
export function parseHeartRate(value: DataView): { bpm: number; rrIntervals?: number[] } {
  const flags = value.getUint8(0);
  const is16bit = (flags & 0x01) !== 0;
  const hasEnergyExpended = (flags & 0x08) !== 0;
  const hasRR = (flags & 0x10) !== 0;

  let offset = 1;
  const bpm = is16bit ? value.getUint16(offset, true) : value.getUint8(offset);
  offset += is16bit ? 2 : 1;

  if (hasEnergyExpended) offset += 2;

  let rrIntervals: number[] | undefined;
  if (hasRR) {
    rrIntervals = [];
    // Cada RR ocupa 2 bytes; puede venir más de uno por paquete.
    while (offset + 1 < value.byteLength) {
      const raw = value.getUint16(offset, true);
      rrIntervals.push(Math.round((raw * 1000) / 1024)); // 1/1024 s → ms
      offset += 2;
    }
    if (rrIntervals.length === 0) rrIntervals = undefined;
  }

  return { bpm, rrIntervals };
}

export class HeartRateMonitor {
  private deviceId: string | null = null;
  private initialized = false;
  private listening = false;
  private stopped = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private onSample: ((sample: HeartRateSample) => void) | null = null;
  private onStatus: ((status: HeartRateStatus) => void) | null = null;
  private simulateTimer: number | null = null;
  private simulatedBpm = 0;

  /** True en cuanto llega un paquete con intervalos RR (→ HRV posible). */
  supportsRR = false;

  async requestAndConnect(onStatus?: (status: HeartRateStatus) => void): Promise<BleDevice> {
    if (!isBleAvailable()) throw new Error('BLE solo disponible en la app nativa (iOS/Android)');
    this.onStatus = onStatus ?? null;
    this.stopped = false;

    if (isBleSimulated() && !Capacitor.isNativePlatform()) {
      this.deviceId = 'simulated-band';
      this.reconnectAttempt = 0;
      this.onStatus?.('connected');
      return { deviceId: this.deviceId, name: 'Banda simulada (dev)' };
    }

    if (!this.initialized) {
      await BleClient.initialize();
      this.initialized = true;
    }

    const device = await BleClient.requestDevice({ services: [HEART_RATE_SERVICE] });
    await BleClient.connect(device.deviceId, () => this.handleUnexpectedDisconnect());
    this.deviceId = device.deviceId;
    this.reconnectAttempt = 0;
    this.onStatus?.('connected');
    return device;
  }

  async startListening(onSample: (sample: HeartRateSample) => void): Promise<void> {
    if (!this.deviceId) throw new Error('No hay banda conectada');
    this.onSample = onSample;
    if (this.deviceId === 'simulated-band') {
      this.startSimulating();
      return;
    }
    await this.subscribe();
  }

  /** Genera BPM realista en zona 2 con paseo aleatorio, un pulso por segundo. */
  private startSimulating(): void {
    this.simulatedBpm = 118 + Math.round(Math.random() * 8);
    this.listening = true;
    this.simulateTimer = window.setInterval(() => {
      const drift = Math.round((Math.random() - 0.5) * 6);
      this.simulatedBpm = Math.min(150, Math.max(95, this.simulatedBpm + drift));
      const rrBase = Math.round(60000 / this.simulatedBpm);
      this.supportsRR = true;
      this.onSample?.({
        bpm: this.simulatedBpm,
        rrIntervals: [rrBase + Math.round((Math.random() - 0.5) * 40)],
        at: Date.now(),
      });
    }, 1000);
  }

  private async subscribe(): Promise<void> {
    if (!this.deviceId || !this.onSample) return;
    await BleClient.startNotifications(
      this.deviceId,
      HEART_RATE_SERVICE,
      HEART_RATE_MEASUREMENT,
      (value) => {
        const { bpm, rrIntervals } = parseHeartRate(value);
        if (rrIntervals?.length) this.supportsRR = true;
        this.onSample?.({ bpm, rrIntervals, at: Date.now() });
      },
    );
    this.listening = true;
  }

  /**
   * Desconexión no provocada por nosotros: se reintenta en segundo plano sin
   * tocar la sesión. Solo se avisa de 'disconnected' cuando se agotan los
   * reintentos — así quien consume sabe que ya sí puede cerrar y guardar.
   */
  private handleUnexpectedDisconnect(): void {
    if (this.stopped) return;
    this.listening = false;
    this.onStatus?.('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || !this.deviceId) return;

    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.onStatus?.('disconnected');
      return;
    }

    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;

    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.stopped || !this.deviceId) return;
      try {
        // Reconecta por deviceId guardado: no hace falta volver a pedir
        // selección al usuario (requestDevice exige gesto del usuario).
        await BleClient.connect(this.deviceId, () => this.handleUnexpectedDisconnect());
        await this.subscribe();
        this.reconnectAttempt = 0;
        this.onStatus?.('connected');
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  async stopListening(): Promise<void> {
    if (!this.deviceId || !this.listening) return;
    if (this.simulateTimer !== null) {
      window.clearInterval(this.simulateTimer);
      this.simulateTimer = null;
      this.listening = false;
      return;
    }
    try {
      await BleClient.stopNotifications(this.deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT);
    } catch {
      // La banda ya podía estar fuera de rango; no es un error accionable.
    }
    this.listening = false;
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.deviceId) return;
    await this.stopListening();
    if (this.deviceId === 'simulated-band') {
      this.deviceId = null;
      this.onSample = null;
      return;
    }
    try {
      await BleClient.disconnect(this.deviceId);
    } catch {
      // Idem: desconectar algo ya desconectado no es un fallo.
    }
    this.deviceId = null;
    this.onSample = null;
  }

  isConnected(): boolean {
    return this.deviceId !== null && this.listening;
  }
}
