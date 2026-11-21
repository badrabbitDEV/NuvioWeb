export type NativeEngine = 'auto' | 'exoplayer' | 'libmpv';

export type NativePlayerCapabilities = {
  version?: string;
  engines: string[];
  transport?: string;
};

type AndroidBridge = {
  capabilities: () => string;
  playMedia: (payload: string) => string;
  stopPlayback: () => void;
  pausePlayback: () => void;
  resumePlayback: () => void;
  seekTo: (seconds: number) => void;
};

declare global {
  interface Window {
    NuvioAndroid?: AndroidBridge;
  }
}

export function getAndroidNativeBridge(): { bridge: AndroidBridge; capabilities: NativePlayerCapabilities } | null {
  if (typeof window === 'undefined' || !window.NuvioAndroid) return null;
  try {
    const capabilities = JSON.parse(window.NuvioAndroid.capabilities()) as NativePlayerCapabilities;
    if (!Array.isArray(capabilities.engines)) return null;
    if (!capabilities.engines.includes('exoplayer') || !capabilities.engines.includes('libmpv')) return null;
    return { bridge: window.NuvioAndroid, capabilities };
  } catch {
    return null;
  }
}

export function launchAndroidNativePlayer(input: { url: string; title: string; engine?: NativeEngine }): { ok: boolean; error?: string } {
  const native = getAndroidNativeBridge();
  if (!native) return { ok: false, error: 'Host nativo Android não encontrado.' };
  try {
    const result = JSON.parse(native.bridge.playMedia(JSON.stringify({
      url: input.url,
      title: input.title.slice(0, 180),
      engine: input.engine ?? 'auto',
    }))) as { ok?: boolean; error?: string };
    return { ok: result.ok === true, ...(result.error ? { error: result.error } : {}) };
  } catch {
    return { ok: false, error: 'O host Android não aceitou o comando de reprodução.' };
  }
}
