# Arquitetura do Nuvio Web Port

## Visão geral

```text
Chrome / Firefox / Safari / Edge
  └─ React + Vite / PWA (Vercel)
       ├─ UI responsiva Normal / Enhanced
       ├─ localStorage + IndexedDB (biblioteca, perfis, progresso, downloads)
       ├─ player HTML5 + HLS.js
       ├─ addons Stremio JSON
       ├─ integrações externas OAuth / API keys
       ├─ Watch Party WebSocket
       └─ WebTorrent + Service Worker + WebRTC
             ├─ peers WebTorrent/WebRTC
             └─ trackers WSS

Express API (Render)
  ├─ TMDB (segredo no servidor)
  ├─ addon manifest/resource proxy com SSRF guard
  ├─ Live TV text proxy + Stalker portal adapter
  ├─ Trakt / SIMKL / WeTrakr adapters
  ├─ MDBList / PublicMetaDB adapters
  ├─ conta, JWT e sincronização PostgreSQL
  ├─ dashboard admin (chave de API + PostgreSQL)
  ├─ analytics agregados com opt-in
  └─ Watch Party WebSocket
```

A API não retransmite torrents nem atua como relay P2P. O WebTorrent funciona no browser. Uma rota separada de FFmpeg pode transcodificar arquivos diretos HTTPS públicos para HLS temporário, usando fetch HTTPS com DNS pinning e redirects bloqueados. Ela não aceita HLS de entrada, URLs autenticadas privadas, DRM, magnet ou torrent. O host Android é um aplicativo independente; não é parte do deploy Vercel.

## Frontend

- React 18, TypeScript, Vite e React Router.
- `AppContext` guarda edição ativa, addons, biblioteca, perfis e configurações.
- Estado local é isolado por perfil através de prefixos `nuvio-web:<profileId>:...`; credenciais de provedores são mantidas em `sessionStorage`, fora do backup cloud.
- IndexedDB guarda progresso e downloads diretos locais.
- `lib/stream-ranking.ts` aplica heurísticas de Smart Streams; não é detecção de hardware equivalente a MediaCodec.
- `lib/p2p.ts` instancia WebTorrent, registra o Service Worker combinado (transporte WebTorrent + cache PWA) e abre um servidor Browser para streaming progressivo.

## API

- Node 22 + Express + TypeScript.
- Helmet, CORS por origem exata, rate limiting, schema validation com Zod e timeouts.
- `/api/v1/catalog/*`: TMDB.
- `/api/v1/addons/*`: inspeção de manifest e consulta a recursos compatíveis.
- `/api/v1/live/*`: busca de texto M3U/XMLTV e operações Stalker.
- `/api/v1/integrations/*`: adaptadores de tracking/metadados.
- `/api/v1/account/*`: conta, autenticação e sincronização com PostgreSQL.
- `/api/v1/admin/*`: métricas e relatórios protegidos por `ADMIN_API_KEY`.
- `/api/v1/analytics/*`: eventos de uso com schema allowlist e sem identificadores de mídia ou conteúdo de busca.
- `/api/v1/media/*`: sessões de transcodificação FFmpeg limitadas por origem, duração, tamanho, concorrência e expiração.
- `/api/v1/party/*` e upgrade `/ws/party/*`: sala temporária, chat e sync de player.

## Segurança do fetch externo

Addon manifests, playlists e portais devem passar pelos utilitários de fetch seguro. O backend limita protocolos, bloqueia IPs privados/reservados, aplica DNS pinning, desativa redirect automático e limita tamanho/tempo de resposta. Novos adaptadores nunca devem aceitar uma URL de destino arbitrária fornecida sem validação.

## Player

- Arquivo direto: elemento HTML5 `video`.
- HLS: HLS.js quando suportado; Safari pode usar HLS nativo.
- Legendas: VTT nativo e conversão de SRT para VTT; o renderer não é libass.
- P2P: WebTorrent v3.0.21 no browser, `WebRTC`, `wss` trackers, Service Worker.
- Fallback FFmpeg: somente arquivos diretos HTTPS, acionado em erro de rede/decodificação/não-suporte do vídeo. O servidor gera segmentos HLS temporários e progressivos (a playlist pode ser carregada antes da conversão completa).
- Host Android: WebView com bridge `WebMessageListener` limitada à origem configurada; Media3 ExoPlayer tenta primeiro e libmpv é fallback. Em falha dos dois engines, sinaliza a página para tentar novamente via Web/FFmpeg. Não replica todos os controles, legendas, tracking ou sincronização do player web.
- Tracking: scrobble e progress são best-effort e não podem bloquear a reprodução.

## Persistência e privacidade

- Dados locais por perfil permanecem no dispositivo/browser.
- Tokens de conta ficam apenas em `sessionStorage`.
- Trakt/SIMKL/WeTrakr usam clientes configurados na Render; tokens de usuário só são enviados à API para a operação correspondente.
- MDBList e PublicMetaDB usam chaves mantidas na sessão e cabeçalhos dedicados; não sincronizar essas chaves para cloud.
- Cloud sync requer PostgreSQL e `SYNC_JWT_SECRET`; fazer backup antes de sincronizar entre dispositivos.
- Analytics é opt-in (desligado por padrão), guarda apenas sessão aleatória, evento allowlist, edição e rota/tipo/provedor genéricos. Admin não expõe e-mail nem IP e só funciona com chave de pelo menos 32 caracteres.
- 
