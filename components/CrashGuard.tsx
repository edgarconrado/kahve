import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

// Atrapa errores fatales de JS y los muestra en pantalla en lugar de
// cerrar la app en silencio (los builds de release no tienen red screen).
let lastFatal: string | null = null;
const defaultHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
(global as any).ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
  lastFatal = `${isFatal ? '[FATAL] ' : ''}${error?.message ?? String(error)}` +
    (error?.stack ? `\n\n${String(error.stack).slice(0, 1200)}` : '');
  // No reenviar al handler default cuando es fatal: eso cerraría la app.
  if (!isFatal) defaultHandler?.(error, isFatal);
});

interface State { error: string | null }

export default class CrashGuard extends React.Component<
  { children: React.ReactNode }, State
> {
  state: State = { error: null };
  private timer?: ReturnType<typeof setInterval>;

  static getDerivedStateFromError(error: any): State {
    return { error: `${error?.message ?? error}\n\n${error?.stack ?? ''}` };
  }

  componentDidMount() {
    // Revisar si el handler global capturó un fatal fuera del render
    this.timer = setInterval(() => {
      if (lastFatal && !this.state.error) this.setState({ error: lastFatal });
    }, 500);
  }

  componentWillUnmount() { clearInterval(this.timer); }

  render() {
    if (this.state.error) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.title}>☕ Kahve encontró un error</Text>
          <Text style={styles.hint}>
            Toma captura de esta pantalla y compártela para diagnosticarlo.
          </Text>
          <Text style={styles.trace}>{this.state.error}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4A1B0C' },
  content: { padding: 24, paddingTop: 70 },
  title: { color: '#FAECE7', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  hint: { color: '#F5C4B3', fontSize: 13, marginBottom: 18 },
  trace: {
    color: '#FAECE7', fontSize: 11, fontFamily: 'monospace', lineHeight: 16,
  },
});
