# Matriz de portabilidade — Nuvio Mobile + Enhanced

Esta matriz diferencia **equivalente web implementado**, **parcial**, **pendente** e **não portável literalmente**. “Implementado” significa que existe um fluxo correspondente no código deste repositório; não significa que todos os serviços externos, addons, codecs ou navegadores foram validados em produção. O host Android e a rota FFmpeg foram acrescentados em 1.0.3, mas não passaram por build/integração final nesta execução.

## Nuvio Mobile — recursos-base

| Área / capacidade de origem | Equivalente neste port | Estado | Notas e diferenças da Web |
|---|---|---|---|
| Navegação e layout | React Router, sidebar desktop e navegação mobile | Implementado | Layout adaptativo para desktop, notebook, tablet e celular. |
| Home e catálogos | TMDB trending/discover + catálogos declarados por addons | Implementado / parcial | Catálogo de addon varia conforme o manifest e autenticação exigida. |
| Hero e destaques | Hero TMDB, banner Card/Full e trailer via embed quando disponível | Parcial | Não replica a superfície de vídeo nativa nem todos os comportamentos de pré-carregamento. |
| Pesquisa e histórico | TMDB, catálogos de addons e histórico local por perfil | Implementado | Busca unificada não cobre provedores proprietários sem adaptador. |
| Detalhes, elenco e recomendações | TMDB + metadados `meta` dos addons | Implementado / parcial | A profundidade depende da fonte de metadados. |
| Temporadas e episódios | Temporadas TMDB e detalhes de episódio | Implementado | Dados podem estar incompletos em títulos recém-lançados ou fontes alternativas. |
| Addon manager | Adição, remoção, habilitar/desabilitar e ordem local | Implementado | Importação de addons com `manifest` público HTTPS. |
| Protocolo de addons | `manifest`, `catalog`, `meta`, `stream`, `subtitles` | Parcial | Sem equivalência universal para configuração customizada, auth proprietária, headers específicos ou recursos fora do contrato. |
| Biblioteca local | Salvar e remover itens, consultar biblioteca | Implementado | Armazenada por perfil no browser. |
| Coleções | Criar e organizar coleções personalizadas | Implementado | Coleções locais e incluídas no backup/sync. |
| Favoritos e assistidos | Estado local + importação de trackers compatíveis | Parcial | O estado remoto depende do suporte e da permissão do provedor conectado. |
| Watch progress / Continue Watching | IndexedDB/localStorage e sincronização de conta opcional | Implementado / parcial | Sincroniza metadados de progresso; não transfere o estado interno de um player nativo. |
| Perfis | Até 8 perfis locais, avatar, modo infantil básico e PIN casual | Implementado / parcial | PIN é conveniência local, não autenticação forte nem controle parental de nível de SO. |
| Perfil insights | Contagens locais de biblioteca, addons e progresso | Parcial | Não replica analytics avançado ou classificação de gosto do app. |
| Configurações e temas | Idioma, tema, cor, animação, fundo, aparência e reprodução | Implementado / parcial | Apenas opções expostas na UI web; itens nativos têm equivalentes limitados. |
| Player de arquivo direto | HTML5 `<video>` | Implementado / parcial | Depende de codec, CORS, container e headers acessíveis ao browser. |
| Player HLS | HLS.js ou HLS nativo do browser | Implementado | Faixas e níveis dependem do manifesto e do browser. |
| Engine MPV / ExoPlayer | Host Android separado em `native-android/` | Parcial / não validado | ExoPlayer tenta abrir primeiro e pode recuar para libmpv. Não roda dentro da aba; o host ainda precisa de build e teste real. |
| Transcodificação de arquivos | FFmpeg no backend, saída HLS temporária | Parcial | Fallback para arquivo direto HTTPS com Content-Type de vídeo, sem redirects. Não processa HLS de entrada, torrent, DRM ou headers privados; consome CPU. |
| Fontes externas e links | URLs HTTPS diretas e HLS acessíveis | Parcial | Cabeçalhos privados, DRM, URLs assinadas complexas e CORS podem impedir reprodução. |
| Legendas VTT/SRT | `<track>` e conversão SRT→VTT | Parcial | ASS/SSA, libass, fontes/posicionamentos avançados podem divergir. |
| Faixas de áudio | Faixas HLS quando expostas por HLS.js | Parcial | Não existe API interoperável para todos os containers e players. |
| Controle de reprodução | Pause/play, seek, volume, velocidade e atalhos | Implementado | Os controles adicionais dependem do browser. |
| PiP / tela cheia | APIs Picture-in-Picture e Fullscreen | Parcial | Suporte varia por navegador/OS e política de gesto do usuário. |
| Auto-next | Consulta de streams do próximo episódio nos addons | Parcial | Requer metadados de episódio e fonte disponível. |
| Skip intro / créditos | Marcadores expostos no stream/addon | Parcial | Não inclui um serviço universal de detecção de segmentos. |
| Subtitle auto-sync / visualização avançada | Offset e sincronização por ouvido simples | Parcial | Não equivale aos alinhadores temporais nativos do projeto. |
| AutoSync complexo de legendas | Sem motor de análise de fala equivalente | Pendente | Parser/aligner e processamento em background do mobile exigem implementação própria. |
| Watch Party | WebSocket, chat e sincronização play/pause/seek | Parcial | Salas temporárias em memória; todos precisam ter acesso à mesma mídia. |
| Login e cloud sync | Conta email/senha, JWT e PostgreSQL | Implementado / parcial | Sync opt-in; não sincroniza tokens externos nem secrets de addons. |
| Downloads | URLs diretas HTTPS salvas em IndexedDB | Parcial | Limites de quota, CORS e remoção de dados do browser; sem downloads torrent ou background garantido. |
| Atualizador de aplicativo | Deploy do site via Vercel | Não aplicável | Navegador sempre carrega a versão publicada; não existe APK updater. |
| Notificações de lançamentos | Sem paridade com notificações nativas persistentes | Pendente | Web Push exige service worker, permissão e um serviço de assinatura/entrega separado. |
| Biometria / PIN de SO | PIN casual local | Não portável literalmente | WebAuthn pode ser adicionado como login, mas não pode controlar biometria nativa do app. |
| Player externo / Infuse | Link externo somente via navegação do browser | Não portável literalmente | Apps externos não são controláveis de forma uniforme. |
| Cast / controles do sistema | APIs Web disponíveis de forma limitada | Pendente / parcial | Não replica integração MediaSession/cast de cada OS/dispositivo. |
| Debrid / cloud providers | Configuração informativa apenas | Pendente | Não alegar resolução de links Premiumize/TorBox enquanto adaptadores completos não existirem. |

## Nuvio Enhanced — recursos adicionais

| Área / capacidade Enhanced | Equivalente neste port | Estado | Notas e diferenças da Web |
|---|---|---|---|
| Glass UI / temas / fundo | CSS glass, tema, cor de destaque e fundo de imagem | Parcial | Estilo adaptado, não reprodução pixel-perfect do Compose. |
| Hero smart framing / dynamic background | Banner responsivo e background web | Parcial | Sem detector de sujeito equivalente em todos os casos. |
| Smart Streams | Ranking por compatibilidade, resolução, codec declarado, HDR, origem, tamanho, idioma, CAM/TS e seeds | Parcial | Metadados de texto são pistas; não mede decoder/hardware/HDR com a mesma profundidade do app nativo. |
| Fonte fixada / ordem de fonte | Propriedades locais de addons/streams | Parcial | Fixação por fonte pode depender da forma como o addon identifica a origem. |
| Quality chooser HLS | Seletor de níveis HLS.js | Implementado | Só para HLS e quando o manifesto expõe níveis. |
| Audio track chooser HLS | Seleção de faixas HLS.js | Parcial | Não funciona para todos os streams/códecs. |
| Subtitle sync by ear | Duas marcações de tempo e offset | Parcial | Ferramenta simples; não replica o pipeline de correção do app. |
| Subtitle font / tamanho / cor | CSS e upload de fonte no navegador | Parcial | Restrições de fontes por formato/renderer; ASS avançado não tem paridade. |
| Mini player | PiP quando disponível | Parcial | Não há janela flutuante sobre o SO equivalente ao mini player Android. |
| Anime4K / upscaler nativo | Sem implementação equivalente | Não portável literalmente | WebGPU shader customizado seria uma funcionalidade nova e não substituiria MediaCodec/Anime4K nativo. |
| Live TV M3U | Importação de arquivo M3U e URL | Implementado | Playlists HTTPS; a origem do canal precisa ser reproduzível no browser. |
| Live TV Xtream | `get.php` M3U e `xmltv.php` | Implementado / parcial | Compatibilidade depende de URL, CORS/proxy seguro e formato entregue. |
| Stalker Portal / MAG | Handshake, perfil, gêneros, canais, create_link e EPG curto | Parcial | Variações de firmware/portal e autorização podem exigir ajustes específicos. |
| EPG XMLTV | Parser XMLTV e associação por ID | Implementado / parcial | EPG pode ser grande e a cobertura depende da playlist/guia. |
| Live TV sports / VOD | Catálogo do provedor não normalizado universalmente | Parcial | Sem equivalência completa das APIs privadas de cada portal. |
| Batch downloads | Downloads de arquivo direto para IndexedDB | Pendente | Sem fila robusta, downloads de torrent ou serviço background. |
| Profile insights avançados | Estatísticas locais simples | Parcial | Sem taste DNA e análises completas do fork. |
| Episode navigator / episódio lookup | Navegação de temporadas e episódios via TMDB | Parcial | Busca avançada e ordenações específicas ainda não têm paridade integral. |
| Discord Rich Presence | Não disponível em aba comum | Não portável literalmente | Exige cliente desktop local ou integração externa explícita. |
| AniList | Token manual, GraphQL, busca e importação para biblioteca | Parcial | Não implementa todas as operações de sync/rating/scrobble do aplicativo. |
| WeTrakr | Device OAuth, conta, histórico assistido e scrobble | Parcial | Exige `WETRAKR_CLIENT_ID` próprio/permitido; refresh é tratado pelo backend. |
| PublicMetaDB | API key, leitura de listas/assistidos/progresso, escrita de watched/resume | Parcial | Ratings e gerenciamento avançado de listas ainda precisam de port. |
| MDBList | API key, usuário, watchlist, listas e consulta de mídia | Parcial | Não implementa ainda todo o sistema de escrita/sync e ratings. |
| OMDb | Não há fluxo completo de configuração/ratings | Pendente | Pode ser acrescentado com chave do usuário/servidor. |
| WeTrakr / PublicMetaDB / AniList ratings | Sem paridade de todas as operações de ratings | Pendente / parcial | Apenas os fluxos listados acima foram implementados. |
| WhatsNew | Sem feed equivalente no port | Pendente | Release notes podem ser adicionadas via endpoint de versão. |
| Discord, downloads avançados e extras de player | Ver linhas anteriores | Parcial / não portável | Recursos dependentes de sistema, App Store ou motores nativos não são copiados literalmente. |

## Protocolo P2P

| Recurso | Estado | Limite |
|---|---|---|
| Abrir magnet URI | Implementado | Precisa de trackers WSS e peers WebRTC compatíveis. |
| Abrir infoHash | Implementado | InfoHash sozinho não garante descoberta de peers WebRTC. |
| Abrir arquivo `.torrent` | Implementado | Torrent deve ter metadados e peers compatíveis. |
| Reproduzir stream addon P2P | Implementado parcialmente | Addon precisa expor `infoHash`/magnet e `fileIdx` correto. |
| Selecionar arquivo de vídeo | Implementado | Codec/container ainda precisa ser aceito pelo browser. |
| Estatísticas de swarm | Implementado | Só enquanto a sessão WebTorrent permanece viva. |
| Semear arquivo local selecionado | Implementado | Compartilhar apenas arquivos cuja distribuição seja autorizada; aba ativa necessária. |
| BitTorrent TCP/UDP convencional | Não disponível diretamente | O browser usa WebRTC; não abre sockets arbitrários para peers BitTorrent nativos. |
| Seed background em celular | Não garantido | Navegadores suspendem abas e workers em background. |

## Checklist de validação antes de produção

- [ ] `npm install` sem erros e `npm run typecheck` em Node 22+.
- [ ] `npm run build` na raiz sem erros.
- [ ] Testar Chrome Android, Firefox Android, Safari iOS e Chromium desktop em dispositivos reais.
- [ ] Validar um addon autorizado para manifest, catálogo, meta, stream e subtitles.
- [ ] Testar MP4 e HLS com CORS no domínio Vercel publicado.
- [ ] Testar torrent público/domínio público com peer WebRTC em HTTPS; testar também seeding autorizado.
- [ ] Testar uma playlist M3U e um XMLTV autorizados e um portal Stalker com credenciais permitidas.
- [ ] Testar OAuth/refresh de Trakt, SIMKL e WeTrakr com apps próprios e chaves reais.
- [ ] Configurar PostgreSQL, backup e CORS para domínios Vercel de produção.
- [ ] Rever rate limits, retenção e logs, URLs de addons permitidas e política de privacidade.


## Administração, catálogo inicial e mídia web — 1.0.3

| Área | Implementação nesta versão | Estado | Notas |
|---|---|---|---|
| Addon Nuvio Catalog | Preset de manifest `https://catalog.nuvio.tv/manifest.json` | Incluído no catálogo curado | A instalação revalida o manifest; a disponibilidade remota varia. |
| OpenSubtitles v3 | Preset de manifest `https://opensubtitles-v3.strem.io/manifest.json` | Incluído no catálogo curado | Legendas dependem de correspondência e formato aceito pelo browser. |
| Feed curado de addons | Feed JSON controlado pelo mantenedor e instalação por manifest | Implementado | Não consome automaticamente um diretório comunitário inteiro; cada manifest é validado. |
| Dashboard admin | Chave API, contas agregadas, sessões aproximadas, rotas, eventos e estado dos serviços | Implementado | Exige `ADMIN_API_KEY` e PostgreSQL; telemetria do cliente é opt-in. |
| Analytics | Eventos allowlist sem IP, e-mail, consulta, ID de mídia ou URL de stream | Implementado | Desativado até o usuário aceitar nas configurações. |
| Diagnóstico GPU/codecs | MediaCapabilities, WebCodecs, WebGL e WebGPU | Parcial | Diagnóstico não força aceleração; browser/SO decide o caminho de hardware. |
| libmpv / ExoPlayer | Host Android `native-android/` com bridge WebMessage; ExoPlayer primeiro e libmpv em fallback | Parcial / não validado | Exige APK separado, URL de produção compilada e teste em dispositivo; não existe dentro da aba Web. A bridge ainda não sincroniza todas as faixas, legendas, progresso ou controles. |


## Novos componentes 1.0.3 e estado de validação

| Componente | Estado | Validação disponível |
|---|---|---|
| `/api/v1/media/transcode` | Implementação no backend | A linha FFmpeg foi testada com vídeo sintético usando `pipe:0`; HLS progressivo iniciou em cerca de 6s, com segmentos H.264/AAC e encerramento normal por limite de duração. MP4 precisa ser streamable/faststart. Rota Express e deploy Render ainda não foram executados. |
| Proteção SSRF para mídia | Implementação com HTTPS, DNS pinning e redirects bloqueados | Testes unitários escritos para IPs privados, localhost e esquemas inválidos; não executados sem instalar dependências. |
| Host `native-android/` | Projeto Android independente | Fontes e dependências declaradas; sem build Gradle/Android SDK nesta sessão. Não distribuir APK sem compilar e validar. |
| Ponte WebView | AndroidX WebMessageListener com origem HTTPS exata e validação de frame principal | Revisão estática do código; requer teste em WebView Android. |
| Build frontend/API | Não validado | Instalação npm anterior expirou por falha de acesso ao registry; a análise sintática TypeScript/TSX de 62 fontes não encontrou erros de sintaxe. Isso não substitui typecheck/build. |
| P2P em swarm | Parcial | Implementação existente usa WebTorrent/WebRTC; nenhuma swarm real foi verificada. |
| Paridade Enhanced total | Pendente em vários recursos | Muitos recursos permanecem parciais ou sem equivalente web; consultar tabelas acima. |


## Módulos frontend 1.0.4

| Diretório | Serviços / comportamento | Integração de tela | Estado / ressalvas |
|---|---|---|---|
| `features/collections` | Modelo, normalização, chaves de mídia, criar/alternar itens | Coleções | Local; depende da biblioteca por perfil. |
| `features/downloads` | URL HTTPS, download limitado a 500 MiB, IndexedDB, quota, URL offline | Downloads e Player | CORS e quota do browser; sem background e sem torrent. |
| `features/live` | M3U/XMLTV, gzip XMLTV, grupos, busca, EPG e validação HTTPS | TV ao Vivo | Depende de fontes autorizadas e compatibilidade/CORS. |
| `features/notifications` | Central local e permissão de Notification API | Configurações e Downloads | Sem envio Web Push do servidor. |
| `features/party` | WebSocket singleton, validação de sala, chat e sync de playback | Watch Party e Player | Sessões voláteis no backend atual. |
| `features/profiles` | Criação, limpeza de dados e PIN PBKDF2-SHA-256 com salt | Perfis | PIN casual local, não é proteção forte. |
| `features/servers` | Autenticação e bibliotecas Jellyfin/Emby; seções e itens Plex | Integrações | CORS obrigatório; APIs não foram testadas em servidores reais. |
| `features/tracking` | Device authorization Trakt/SIMKL, assistidos e scrobble Trakt | Integrações e Player | Requer credenciais e configuração backend. |

A presença dos módulos e suas ligações às páginas não implica validação de todos os provedores ou execução em produção. Consulte `docs/VERIFICATION.md`.
