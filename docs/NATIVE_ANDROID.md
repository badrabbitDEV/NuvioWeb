# Host Android nativo — ExoPlayer + libmpv

Este módulo é um aplicativo Android independente, localizado em `native-android/`. Ele carrega a versão web HTTPS dentro de um WebView e oferece um player nativo para URLs diretas HTTPS.

## Arquitetura

- WebView: JavaScript/DOM storage habilitados; file/content access desabilitados; mixed content bloqueado; Safe Browsing ativo.
- Bridge: AndroidX `WebMessageListener` com allowlist de uma origem e validação de `isMainFrame`; não usa `addJavascriptInterface`.
- ExoPlayer: Media3 1.8.0; tenta reproduzir a URL inicialmente.
- libmpv: `io.github.abdallahmehiz:mpv-android-lib:0.2.1`, mesma coordenada/versionamento declarados pelo upstream Nuvio Mobile; acionado em fallback quando ExoPlayer falha.
- Ao fechar o player, o host dispara `nuvio-native-player-closed`; se ExoPlayer e libmpv falharem, dispara `nuvio-native-player-failed` para a página tentar o player Web e o fallback FFmpeg, quando suportado.

## Construir

Requisitos: Android Studio/SDK, JDK 17, Gradle compatível com Android Gradle Plugin 8.7.3, conexão para baixar dependências Maven. Configure a URL final da Vercel, incluindo domínio/porta exatos, com `NUVIO_WEB_URL` ou propriedade Gradle:

```bash
cd native-android
gradle -PnuvioWebUrl=https://SEU-SITE.vercel.app/ assembleDebug
```

O valor padrão é um domínio `.invalid` propositalmente placeholder. Não publique APK usando o padrão. A URL precisa ser HTTPS e a página não deve redirecionar para outro host, pois a bridge é limitada à origem configurada.

## Limitações conhecidas

- O host aceita URL HTTPS direta, não aceita magnet/torrent, redirects, headers privados ou DRM.
- ExoPlayer usa os decoders disponíveis no Android. Se falhar, o código tenta libmpv; se ambos falharem, exibe erro.
- A bridge atual oferece início/encerramento, pausa, retomada e seek; em falha dos dois engines, volta à reprodução Web e pode solicitar a conversão FFmpeg para arquivo direto HTTPS. Ela ainda não espelha toda a telemetria, seleção de áudio/legenda, progresso, Trakt/WeTrakr, Watch Party ou todos os controles do player web.
- O modo `auto` inicia com ExoPlayer e tenta libmpv após erro. A escolha explícita `libmpv` inicia essa engine primeiro.
- Não há teste de APK, dispositivo, orientação, codec, HDR, DRM ou lifecycle realizado nesta sessão. Trate o projeto como integração preparada, não como APK validado.
- 
