import { useEffect, useState } from 'react';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from './supabase';

interface VersionInfo {
  latestVersion: string;
  minRequiredVersion: string | null;
  updateUrl: string;
  message: string | null;
}

// Compara versiones tipo "1.0.5" vs "1.0.10" segmento por segmento
// (una comparación de texto simple fallaría: "1.0.10" < "1.0.9" como texto).
function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    // Versión REAL instalada (del binario nativo), no la de app.json —
    // esta lee directo del paquete instalado, es la fuente de verdad.
    const installed = Application.nativeApplicationVersion ?? '0.0.0';

    supabase
      .from('app_versions')
      .select('latest_version, min_required_version, update_url, message')
      .eq('platform', platform)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const versionInfo: VersionInfo = {
          latestVersion: data.latest_version,
          minRequiredVersion: data.min_required_version,
          updateUrl: data.update_url,
          message: data.message,
        };
        setInfo(versionInfo);
        setUpdateAvailable(isNewer(data.latest_version, installed));
        setUpdateRequired(
          !!data.min_required_version && isNewer(data.min_required_version, installed),
        );
      });
  }, []);

  return { updateAvailable, updateRequired, info };
}
