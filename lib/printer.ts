import AsyncStorage from '@react-native-async-storage/async-storage';
import ThermalPrinterModule from 'react-native-thermal-printer';

// Configuración de la impresora térmica, guardada EN ESTE DISPOSITIVO
// (no en Supabase): la impresora está atada físicamente a la tablet/
// teléfono de una sucursal, no a la organización en general.
const KEY_MAC = 'kahve:printer:mac';
const KEY_NAME = 'kahve:printer:name';
const KEY_WIDTH = 'kahve:printer:widthMM'; // '58' | '80'

export interface PairedPrinter { name: string; macAddress: string }

export async function getPairedPrinters(): Promise<PairedPrinter[]> {
  // Si el módulo nativo no está disponible (ej. estás en Expo Go en vez
  // de un build compilado con EAS después de instalar el paquete), esto
  // avisa con un mensaje claro en vez de tronar con un error críptico.
  if (!ThermalPrinterModule) {
    throw new Error(
      'La impresora no está disponible en esta versión de la app. ' +
      'Esta función requiere un build compilado (no funciona en Expo Go).',
    );
  }
  // NOTA: nombre de método a confirmar contra la versión instalada de
  // react-native-thermal-printer — algunas versiones lo exponen como
  // getBluetoothDeviceList(); si el nombre difiere, ajusta esta línea
  // (el resto del módulo no cambia).
  const raw = await (ThermalPrinterModule as any).getBluetoothDeviceList?.();

  // La forma exacta del objeto que regresa varía entre versiones de la
  // librería (deviceName vs name, address vs macAddress). Normalizamos
  // aquí probando las variantes más comunes, en vez de asumir una sola.
  return ((raw ?? []) as any[]).map((d) => ({
    name: d.name ?? d.deviceName ?? d.friendlyName ?? '',
    macAddress: d.macAddress ?? d.address ?? d.mac ?? '',
  })).filter((d) => d.macAddress); // descarta entradas sin MAC (inservibles)
}

export async function getSelectedPrinter(): Promise<
  { name: string; macAddress: string; widthMM: '58' | '80' } | null
> {
  const [mac, name, width] = await Promise.all([
    AsyncStorage.getItem(KEY_MAC),
    AsyncStorage.getItem(KEY_NAME),
    AsyncStorage.getItem(KEY_WIDTH),
  ]);
  if (!mac) return null;
  return { macAddress: mac, name: name ?? 'Impresora', widthMM: (width as '58' | '80') ?? '58' };
}

export async function selectPrinter(printer: PairedPrinter, widthMM: '58' | '80' = '58') {
  await AsyncStorage.setItem(KEY_MAC, printer.macAddress);
  await AsyncStorage.setItem(KEY_NAME, printer.name);
  await AsyncStorage.setItem(KEY_WIDTH, widthMM);
}

export async function forgetPrinter() {
  await AsyncStorage.multiRemove([KEY_MAC, KEY_NAME, KEY_WIDTH]);
}

export interface ReceiptLine {
  quantity: number;
  name: string;
  modifiers: string[];
  total: number;
}

export interface ReceiptData {
  orgName: string;
  orderNumber: number;
  customerName: string | null;
  createdAt: Date;
  lines: ReceiptLine[];
  discount: number;
  tax: number;
  tip: number;
  total: number;
  method: string;
  received: number | null;
  change: number | null;
}

// La mayoría de impresoras térmicas económicas usan una codificación
// antigua (CP437/850), no UTF-8: enviar acentos o ñ tal cual produce
// caracteres corruptos. Los quitamos antes de imprimir.
function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita los acentos (é → e, ñ → n, etc.)
    .replace(/[^\x00-\x7F]/g, '');    // quita cualquier otro carácter no-ASCII (emojis, etc.)
}

// Texto plano, SIN etiquetas <C>/<B>: react-native-thermal-printer no
// las interpreta — las imprime literalmente como texto, que es
// justamente el bug que se reportó. El centrado y las columnas se
// calculan aquí con espacios, según el ancho real de la impresora.
function buildReceiptPayload(r: ReceiptData, charsPerLine: number): string {
  const center = (text: string) => {
    const pad = Math.max(Math.floor((charsPerLine - text.length) / 2), 0);
    return ' '.repeat(pad) + text;
  };
  const line = (left: string, right: string) => {
    const space = Math.max(charsPerLine - left.length - right.length, 1);
    return left + ' '.repeat(space) + right;
  };
  const rule = '-'.repeat(charsPerLine);
  const money = (n: number) => `$${n.toFixed(2)}`;

  let out = '';
  out += center(r.orgName) + '\n';
  out += center(`Orden #${String(r.orderNumber).padStart(3, '0')}`) + '\n';
  out += center(r.createdAt.toLocaleString('es-MX')) + '\n';
  if (r.customerName) out += center(`Cliente: ${r.customerName}`) + '\n';
  out += rule + '\n';

  for (const l of r.lines) {
    out += line(`${l.quantity}x ${l.name}`, money(l.total)) + '\n';
    for (const m of l.modifiers) out += `   ${m}\n`;
  }

  out += rule + '\n';
  if (r.discount > 0) out += line('Descuento', `-${money(r.discount)}`) + '\n';
  out += line('IVA incluido', money(r.tax)) + '\n';
  if (r.tip > 0) out += line('Propina', money(r.tip)) + '\n';
  out += line('TOTAL', money(r.total)) + '\n';
  out += line('Pago', r.method) + '\n';
  if (r.received !== null) {
    out += line('Recibido', money(r.received)) + '\n';
    out += line('Cambio', money(r.change ?? 0)) + '\n';
  }
  out += '\n' + center('Gracias por tu visita!') + '\n\n\n';
  return stripAccents(out);
}

export async function printReceipt(data: ReceiptData): Promise<void> {
  if (!ThermalPrinterModule) {
    throw new Error(
      'La impresora no está disponible en esta versión de la app. ' +
      'Esta función requiere un build compilado (no funciona en Expo Go).',
    );
  }
  const printer = await getSelectedPrinter();
  if (!printer) {
    throw new Error('No hay una impresora configurada en este dispositivo.');
  }
  const charsPerLine = printer.widthMM === '58' ? 32 : 42;
  const payload = buildReceiptPayload(data, charsPerLine);
  await ThermalPrinterModule.printBluetooth({
    macAddress: printer.macAddress,
    payload,
    printerWidthMM: Number(printer.widthMM),
    printerNbrCharactersPerLine: charsPerLine,
  });
}
