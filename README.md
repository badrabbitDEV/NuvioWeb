# Nuvio Web Port — 1.0.4

Port comunitário para navegador, organizado em duas edições — **Normal** e **Enhanced** — com frontend para Vercel e API para Render. O objetivo é preservar os fluxos e a organização do Nuvio Mobile, reimplementando o que é compatível com a Web. Não é um build oficial do Nuvio, nem uma conversão automática do projeto Kotlin/Compose.

> **Limite técnico importante:** uma página hospedada na Vercel não consegue carregar uma biblioteca nativa Android como libmpv/MPVKit ou ExoPlayer. O player Web usa o pipeline multimídia do navegador (`<video>`, HLS.js, APIs MediaCapabilities/WebCodecs quando disponíveis). A aceleração de decodificação é escolhida pelo browser/SO; o app pode diagnosticar suporte e usar GPU para composição/efeitos WebGL/WebGPU, mas não pode forçar um decoder de hardware. Uma integração libmpv real exige um host instalado (desktop/mobile) que exponha uma bridge nativa.

## O que vem configurado

A lista inicial de addons contém apenas:

- **Nuvio Catalog** — `https://catalog.nuvio.tv/manifest.json`.
- **OpenSubtitles v3** — `https://opensubtitles-v3.strem.io/manifest.json`.

O Nuvio Catalog é o catálogo oficial do projeto Nuvio; OpenSubtitles v3 aparece no índice oficial de addons do Stremio. O Nuvio Catalog declara configuração de idioma e região: use o botão **Configurar** para abrir o configurador oficial e escolha suas preferências antes de adicionar a URL configurada. OpenSubtitles v3 não declara essa etapa. Addons que precisam de configuração devem ser configurados no site do desenvolvedor antes de instalar o manifest final.

A área de configurações aceita uma URL de **feed JSON curado** que você controla. Ela espera um documento JSON com uma lista de manifests, não o endereço HTML inicial de um diretório de addons. Assim, você pode manter no seu GitHub uma seleção revisada de serviços. O formato esperado é:

```json
{
  "addons": [
    {
      "name": "Nome do addon",
      "description": "Descrição curta",
      "manifestUrl": "https://exemplo.org/manifest.json",
      "adult": false,
      "configurable": true,
      "category": "catalog"
    }
  ]
}
```

O navegador consulta o feed pela API com proteção SSRF. O app não instala uma listagem comunitária inteira automaticamente: importa somente a sua lista revisada, revalida cada manifest na instalação e descarta itens classificados como impróprios pela política de conteúdo. Cada addon é um serviço externo independente; verificação de manifest não garante disponibilidade ou qualidade de cada stream.

## Módulos

### Experiência Nuvio

- Layout responsivo para desktop, notebook, tablet e celular.
- Alternância Normal/Enhanced nas configurações e na navegação.
- Catálogos TMDB, pesquisa, páginas de detalhes, temporadas e episódios.
- Addons Stremio: manifest, catálogo, metadata, streams e legendas.
- Biblioteca, histórico de reprodução, perfis locais, coleções e preferências.
- Player HTML5/HLS, legendas compatíveis, velocidade, Picture-in-Picture e atalhos.
- Fallback opcional de transcodificação FFmpeg no servidor para arquivos diretos HTTPS compatíveis, com HLS progressivo e limites de recursos.
- Host Android separado com ExoPlayer e tentativa automática de fallback para libmpv nativo.
- Conta e sincronização PostgreSQL opcionais.
- Integrações externas descritas na matriz de paridade.

### Enhanced Web

- Módulos de domínio isolados em `frontend/src/features/`, com serviços reutilizáveis conectados às páginas.

- Glass UI, temas, cores, fundos e destaques configuráveis.
- Smart Streams para ordenar e filtrar pelos metadados declarados pelas fontes.
- Seletor de níveis/faixas HLS quando o manifesto expõe os dados.
- M3U, Xtream, Stalker Portal/MAG e XMLTV/EPG, sujeitos às APIs e CORS dos provedores.
- Watch Party por WebSocket.
- Downloads locais diretos, sujeitos a CORS, quota e restrições do navegador.
- WebTorrent/WebRTC: magnet, infoHash, `.torrent`, reprodução de arquivo compatível e seed de arquivos selecionados pelo usuário.

### Administração e métricas

- Dashboard protegido em `/admin`.
- A chave é configurada na API por `ADMIN_API_KEY` (mínimo 32 caracteres); nunca use prefixo `VITE_`.
- Métricas agregadas: contas, sessões ativas aproximadas, visualizações, eventos de reprodução, uso P2P, rotas mais acessadas, estado dos serviços e eventos recentes.
- A telemetria é **opt-in** e vem desativada por padrão em Configurações.
- Não armazena IP, e-mail, texto pesquisado, ID de mídia, URL de stream nem tokens nos eventos de analytics.

## Estrutura

```text
nuvio-web-port/
├── frontend/                  # React + TypeScript + Vite — Vercel
│   ├── public/                 # PWA, Service Worker e feed curado inicial
│   └── src/
│       ├── components/         # Shell, analytics, diagnósticos de mídia
│       ├── features/           # domínios: coleções, downloads, live, notificações, party, perfis, servidores, tracking
│       ├── lib/                # API, storage, P2P, player, ranking, M3U/XMLTV
│       └── pages/              # catálogo, busca, player, live, admin etc.
├── backend/                   # Node.js + Express + TypeScript + FFmpeg — Render
│   └── src/
│       ├── routes/             # catálogo, addons, live, party, account, admin, analytics
│       ├── security/           # SSRF, sessão e proteção de rede
│       └── services/           # TMDB e protocolo Stremio
├── native-android/            # host Android WebView + ExoPlayer/libmpv
├── docs/                      # arquitetura, paridade, segurança, mídia e deploy
├── LICENSE                    # GPL-3.0
├── NOTICE.md
├── render.yaml
└── vercel.json
```

## Desenvolvimento

Requisitos: Node.js 22+ e npm 10+.

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Terminal 1 — API:

```bash
npm run dev --workspace @nuvio/api
```

Terminal 2 — frontend:

```bash
npm run dev --workspace @nuvio/web
```

Frontend: `http://localhost:5173` · API: `http://localhost:4000`.

### Variáveis do frontend

```env
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_DEFAULT_EDITION=normal
# Opcional, apenas trackers WebSocket confiáveis:
# VITE_WEBTORRENT_TRACKERS=wss://tracker.example
```

`VITE_DEFAULT_EDITION` aceita `normal` ou `enhanced`. Toda variável `VITE_*` é pública no bundle.

### Variáveis do backend

```env
PORT=4000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:4173
TMDB_API_READ_TOKEN=
ADDON_ALLOW_HTTP=false
DATABASE_URL=
SYNC_JWT_SECRET=
ADMIN_API_KEY=
TRAKT_CLIENT_ID=
TRAKT_CLIENT_SECRET=
SIMKL_CLIENT_ID=
SIMKL_CLIENT_SECRET=
WETRAKR_CLIENT_ID=
FFMPEG_PATH=ffmpeg
MEDIA_TRANSCODE_ENABLED=false
MEDIA_MAX_CONCURRENT=1
MEDIA_SESSION_TTL_SECONDS=7200
MEDIA_MAX_INPUT_GB=12
MEDIA_MAX_DURATION_SECONDS=7200
MEDIA_MAX_HEIGHT=720
PUBLIC_API_BASE_URL=https://SUA-API.onrender.com
```

`ADMIN_API_KEY`, `TMDB_API_READ_TOKEN`, segredos OAuth, `DATABASE_URL` e `SYNC_JWT_SECRET` pertencem somente à API. Não os coloque no frontend ou em arquivos commitados.

## Deploy

Leia [`docs/DEPLOY_VERCEL_RENDER.md`](docs/DEPLOY_VERCEL_RENDER.md).

- **Render:** Blueprint `render.yaml` usa `backend/Dockerfile`, Node 22, FFmpeg/libx264 e health check `/health`. Defina `PUBLIC_API_BASE_URL` com a URL HTTPS real da API.
- **Vercel:** raiz do repositório; install `npm install`; build `npm run build:web`; output `frontend/dist`; variável `VITE_API_BASE_URL=https://SUA-API.onrender.com/api/v1`.
- Para duas URLs, crie dois projetos Vercel com `VITE_DEFAULT_EDITION=normal` e `enhanced`. Inclua ambos em `CORS_ORIGINS` na Render.
- Configure PostgreSQL se quiser contas/sync e `ADMIN_API_KEY` para habilitar `/admin`.

## P2P e compatibilidade

WebTorrent no navegador usa WebRTC. A swarm precisa de peers WebRTC/WebTorrent e trackers WebSocket; peers BitTorrent TCP/UDP comuns não são diretamente acessíveis numa página. P2P precisa de HTTPS (ou localhost), WebRTC e Service Worker. Fechar ou minimizar a aba pode suspender a atividade, sobretudo em celulares. Use somente arquivos próprios, de domínio público ou cuja distribuição esteja autorizada. Consulte [`docs/P2P_BROWSER.md`](docs/P2P_BROWSER.md).

O diagnóstico em Configurações consulta codecs declarados por MediaCapabilities, WebCodecs, WebGL, WebGPU e a bridge do host Android. Isso não força aceleração nem prova o comportamento de cada vídeo. MPV, ExoPlayer e MediaCodec rodam apenas no host Android separado, não na aba do navegador. O host ainda não foi compilado/testado nesta sessão; veja `docs/NATIVE_ANDROID.md`.

Outras limitações relevantes: DRM/EME depende de licenças e suporte do navegador; CORS pode impedir streams e legendas; PiP, tela cheia, codecs e armazenamento variam por dispositivo; notificações persistentes, biometria, downloads em background, Discord Rich Presence e vários motores nativos não têm paridade numa aba comum. A matriz registra o estado real por recurso.

## Licenças

Os projetos de origem declaram GPL-3.0. Este port mantém a atribuição e a licença GPL-3.0. WebTorrent/Service Worker possuem atribuição MIT em `LICENSES/WebTorrent-MIT.txt`. TMDB não endossa nem certifica o projeto. Veja `NOTICE.md`.

## Documentação

- [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md) — estado de cada recurso.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura e fluxo de dados.
- [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md) — segurança, SSRF, sessões e privacidade.
- [`docs/P2P_BROWSER.md`](docs/P2P_BROWSER.md) — P2P, WebRTC e seeding.
- [`docs/DEPLOY_VERCEL_RENDER.md`](docs/DEPLOY_VERCEL_RENDER.md) — configuração de hospedagem.
- [`docs/NATIVE_ANDROID.md`](docs/NATIVE_ANDROID.md) — host Android nativo e bridge WebMessage.
- [`docs/SERVER_TRANSCODE.md`](docs/SERVER_TRANSCODE.md) — FFmpeg, limites e fluxo de conversão.
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — testes locais concluídos e verificações ainda pendentes.
- [`SECURITY.md`](SECURITY.md) — reporte responsável de falhas.
