import { Capacitor } from '@capacitor/core';
import { BleClient, BleDevice } from '@capacitor-community/bluetooth-le';

// Heart Rate Service estándar Bluetooth SIG — soportado por cualquier banda
// de pecho/brazo (Polar H10, Coospo, Wahoo, Garmin HRM...). §4.2 del plan.
const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

export function isBleAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

// Parsea el formato estándar Heart Rate Measurement (GATT spec 0x2A37):
// byte 0 = flags (bit0: 0=uint8 BPM, 1=uint16 BPM); bytes siguientes = BPM.
function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0);
  const is16bit = (flags & 0x1) !== 0;
  return is16bit ? value.getUint16(1, true) : value.getUint8(1);
}

export class HeartRateMonitor {
  private deviceId: string | null = null;
  private initialized = false;

  async requestAndConnect(onDisconnect?: () => void): Promise<BleDevice> {
    if (!isBleAvailable()) throw new Error('BLE solo disponible en la app nativa (iOS/Android)');
    if (!this.initialized) {
      await BleClient.initialize();
      this.initialized = true;
    }
    const device = await BleClient.requestDevice({ services: [HEART_RATE_SERVICE] });
    await BleClient.connect(device.deviceId, () => onDisconnect?.());
    this.deviceId = device.deviceId;
    return device;
  }

  async startListening(onBpm: (bpm: number) => void): Promise<void> {
    if (!this.deviceId) throw new Error('No hay banda conectada');
    await BleClient.startNotifications(this.deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT, (value) => {
      onBpm(parseHeartRate(value));
    });
  }

  async stopListening(): Promise<void> {
    if (!this.deviceId) return;
    await BleClient.stopNotifications(this.deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT);
  }

  async disconnect(): Promise<void> {
    if (!this.deviceId) return;
    await BleClient.disconnect(this.deviceId);
    this.deviceId = null;
  }

  isConnected(): boolean {
    return this.deviceId !== null;
  }
}
