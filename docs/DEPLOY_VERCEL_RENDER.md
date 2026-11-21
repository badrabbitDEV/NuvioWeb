# Deploy: Render + Vercel

## 1. GitHub

Crie um repositório sob sua conta e envie o conteúdo completo desta pasta. Não envie `.env`, tokens, chaves privadas ou credenciais. O projeto é monorepo e a raiz contém `package.json`, `render.yaml` e `vercel.json`.

```bash
git init
git add .
git commit -m "feat: Nuvio Web Port 1.0.4"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

## 2. Render — backend

1. Crie um Blueprint a partir do repositório (lê `render.yaml`).
2. O blueprint usa `backend/Dockerfile` e instala FFmpeg/libx264 no container.
3. Health check: `/health`.
4. Mantenha somente uma instância do serviço enquanto o gerenciamento de sessões for em memória; múltiplas réplicas exigem store/worker compartilhado.

Configure no painel Render:

| Variável | Uso |
|---|---|
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | Origens Vercel exatas, separadas por vírgula; inclua os dois projetos Normal/Enhanced se ambos forem usados |
| `TMDB_API_READ_TOKEN` | Opcional; necessário para metadados TMDB |
| `TRAKT_CLIENT_ID` | ID do seu app Trakt |
| `TRAKT_CLIENT_SECRET` | Secret do seu app Trakt |
| `SIMKL_CLIENT_ID` | ID do seu app SIMKL |
| `SIMKL_CLIENT_SECRET` | Secret do seu app SIMKL |
| `WETRAKR_CLIENT_ID` | ID de um aplicativo WeTrakr seu/autorizado |
| `DATABASE_URL` | PostgreSQL para contas e sincronização (opcional) |
| `SYNC_JWT_SECRET` | Segredo aleatório longo para assinar JWTs; necessário com DATABASE_URL |
| `ADMIN_API_KEY` | Chave aleatória de pelo menos 32 caracteres; necessária para abrir `/admin` |
| `ADDON_ALLOW_HTTP` | Deixe `false`; HTTP não é permitido para fontes remotas em produção |
| `PUBLIC_API_BASE_URL` | URL HTTPS pública completa da API, por exemplo `https://nuvio-api.onrender.com`; obrigatória se o fallback FFmpeg estiver ligado |
| `MEDIA_TRANSCODE_ENABLED` | Começa em `false`; habilite `true` somente em instância com CPU/RAM suficientes e após configurar `PUBLIC_API_BASE_URL` |
| `MEDIA_MAX_CONCURRENT` | `1` no plano pequeno; limite efetivo de 1–2 sessões por processo |
| `MEDIA_SESSION_TTL_SECONDS` | Tempo de vida de cada sessão em segundos (300–7200) |
| `MEDIA_MAX_INPUT_GB` | Limite do arquivo de entrada (1–20 GB) |
| `MEDIA_MAX_DURATION_SECONDS` | Limite da duração convertida (60–10800s) |
| `MEDIA_MAX_HEIGHT` | `480`, `720` ou `1080`; resoluções maiores aumentam consumo de CPU |

`ADMIN_API_KEY` deve existir somente na Render e nunca em variáveis `VITE_*`. O dashboard `/admin` usa essa chave na sessão atual do navegador; telemetria é opt-in e agregada.

`MDBList` e `PublicMetaDB` recebem credenciais de cada usuário via cabeçalhos dedicados e não precisam de chaves globais no Render. Não configure client IDs de terceiros sem autorização.

Após deploy, verifique `https://SUA-API.onrender.com/health`. A resposta lista adaptadores habilitados, não a disponibilidade de cada serviço remoto. O Dockerfile exige encoder `libx264`. A transcodificação é pesada para CPUs de planos gratuitos e o sistema de arquivos do container é temporário; não habilite para uso amplo sem medir CPU, RAM, banda e armazenamento no plano escolhido.

## 3. Vercel — frontend

1. Importe o repositório na Vercel.
2. Root Directory: `.`.
3. Install Command: `npm install`.
4. Build Command: `npm run build:web`.
5. Output Directory: `frontend/dist`.
6. Environment variables:

| Variável | Valor |
|---|---|
| `VITE_API_BASE_URL` | `https://SUA-API.onrender.com/api/v1` |
| `VITE_DEFAULT_EDITION` | `normal` ou `enhanced` |
| `VITE_WEBTORRENT_TRACKERS` | Opcional; lista pública de endpoints `wss://` confiáveis, separados por vírgula |

A `vercel.json` configura rewrite para a SPA e cabeçalhos para o Service Worker do WebTorrent/PWA. Não coloque segredos em `VITE_*`.

## 4. Publicar duas edições

Crie dois projetos Vercel apontando para a mesma branch:

- `nuvio-web-normal` com `VITE_DEFAULT_EDITION=normal`.
- `nuvio-web-enhanced` com `VITE_DEFAULT_EDITION=enhanced`.

Ambos compartilham a mesma API Render. Adicione os dois domínios de produção a `CORS_ORIGINS` e faça redeploy da API.

## 5. Pós-deploy

- [ ] `GET /health` da API responde `ok: true`.
- [ ] A origem exata do site está em `CORS_ORIGINS`.
- [ ] `TMDB_API_READ_TOKEN` está somente na Render.
- [ ] Busca TMDB funciona.
- [ ] Addon autorizado retorna manifest/catalog/streams compatíveis.
- [ ] Fonte HTTPS autorizada toca no browser escolhido.
- [ ] P2P testado em HTTPS com torrent de domínio público ou arquivo seu e peer WebRTC disponível.
- [ ] M3U/XMLTV/portal Stalker testados apenas com fontes e credenciais autorizadas.
- [ ] OAuth e refresh de cada provedor validados com as suas credenciais.
- [ ] PostgreSQL e backup ativados antes de usar cloud sync.

## 6. Host Android nativo

O host Android não faz parte do deploy Vercel. Abra `native-android/` com Android Studio/Gradle e configure `NUVIO_WEB_URL` com a URL HTTPS exata do site (host + porta devem coincidir; redirects para outro host não são aceitos pela bridge). Exemplo de build com Gradle instalado:

```bash
cd native-android
gradle -PnuvioWebUrl=https://SEU-SITE.vercel.app/ assembleDebug
```

O APK usa ExoPlayer e tenta libmpv em fallback. Compile e teste em dispositivo Android antes de distribuir; este pacote ainda não passou por build Android nesta execução.

## 7. Observações

Domínios de Preview da Vercel também são origens diferentes. Para os usar, inclua cada origem pretendida em `CORS_ORIGINS`; não configure CORS `*` como workaround. O plano gratuito da Render pode suspender serviços após inatividade, causando cold start na primeira chamada.

**Atenção:** o Blueprint deixa a transcodificação desativada por padrão. O Docker instala FFmpeg, mas o fallback consome CPU e pode não ser estável no plano gratuito. Ative `MEDIA_TRANSCODE_ENABLED=true` somente depois de escolher capacidade apropriada e validar uma fonte real.
