export type DecodeProbe = {
  codec: string;
  supported: boolean;
  smooth?: boolean;
  powerEfficient?: boolean;
  note?: string;
};

export type MediaEngineReport = {
  browser: string;
  secureContext: boolean;
  webCodecs: boolean;
  webGpu: boolean;
  webGl: boolean;
  nativeBridge: boolean;
  nativeEngine?: string;
  probes: DecodeProbe[];
  checkedAt: string;
};

type MediaCapabilityNavigator = Navigator & {
  mediaCapabilities?: {
    decodingInfo: (configuration: {
      type: 'file';
      video: { contentType: string; width: number; height: number; bitrate: number; framerate: number };
    }) => Promise<{ supported: boolean; smooth: boolean; powerEfficient: boolean }>;
  };
  gpu?: { requestAdapter: () => Promise<unknown | null> };
};

type NativePlayerWindow = Window & {
  NuvioAndroid?: { capabilities?: () => string };
};

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome / Chromium';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Navegador compatível';
}

export async function inspectMediaEngine(): Promise<MediaEngineReport> {
  const nav = navigator as MediaCapabilityNavigator;
  let native: { engines: string[]; version?: string } | undefined;
  try {
    const payload = (window as NativePlayerWindow).NuvioAndroid?.capabilities?.();
    if (payload) {
      const parsed = JSON.parse(payload) as { engines?: unknown; version?: string };
      if (Array.isArray(parsed.engines) && parsed.engines.every((engine) => typeof engine === 'string')) {
        native = { engines: parsed.engines, version: parsed.version };
      }
    }
  } catch { native = undefined; }
  const webGl = (() => {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch { return false; }
  })();
  let webGpu = false;
  try { webGpu = Boolean(nav.gpu && await nav.gpu.requestAdapter()); } catch { webGpu = false; }
  const candidates = [
    { codec: 'H.264 / AVC 1080p', contentType: 'video/mp4; codecs="avc1.640028"', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 },
    { codec: 'VP9 1080p', contentType: 'video/webm; codecs="vp09.00.40.08"', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 },
    { codec: 'AV1 1080p', contentType: 'video/mp4; codecs="av01.0.08M.08"', width: 1920, height: 1080, bitrate: 6_000_000, framerate: 30 },
  ];
  const probes: DecodeProbe[] = [];
  for (const candidate of candidates) {
    if (!nav.mediaCapabilities?.decodingInfo) {
      probes.push({ codec: candidate.codec, supported: MediaSource.isTypeSupported(candidate.contentType), note: 'MediaCapabilities indisponível; resultado baseado apenas no suporte de tipo.' });
      continue;
    }
    try {
      const result = await nav.mediaCapabilities.decodingInfo({ type: 'file', video: candidate });
      probes.push({ codec: candidate.codec, supported: result.supported, smooth: result.smooth, powerEfficient: result.powerEfficient });
    } catch {
      probes.push({ codec: candidate.codec, supported: false, note: 'O navegador não conseguiu consultar este perfil de decodificação.' });
    }
  }
  return {
    browser: browserName(),
    secureContext: window.isSecureContext,
    webCodecs: 'VideoDecoder' in window && 'VideoEncoder' in window,
    webGpu,
    webGl,
    nativeBridge: Boolean(native),
    nativeEngine: native ? `Android nativo (${native.engines.join(' + ')})` : undefined,
    probes,
    checkedAt: new Date().toISOString(),
  };
}
