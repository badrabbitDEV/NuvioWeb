# Modelo de segurança

## Superfície externa

A API consulta URLs de addons fornecidas pelo usuário. Isso cria uma superfície de SSRF e abuso de rede; por isso o fetch fica isolado em `backend/src/security/safe-fetch.ts`.

### Controles

- Esquema HTTPS obrigatório por padrão. HTTP só pode ser ligado em desenvolvimento com `ADDON_ALLOW_HTTP=true`.
- Bloqueio de `localhost`, sufixos locais e portas fora de 80/443.
- Resolução DNS antes da conexão e rejeição se qualquer IP resolvido não for unicast público.
- Endereços resolvidos são fixados no lookup do agente HTTP para reduzir risco de DNS rebinding.
- Redirects desabilitados.
- Timeout de solicitação e limites de corpo/resposta JSON.
- API rate limit global e limite específico para início de transcodificação.
- Login/registro limitados por IP para reduzir tentativas automatizadas.
- Sessões FFmpeg com IDs aleatórios, tamanho/duração/concorrência limitados, encerramento e remoção de diretório temporário.
- O processo FFmpeg recebe os bytes via stdin; não é autorizado a resolver nem buscar diretamente URLs externas.
- Manifest consultado novamente antes de recursos, para verificar capacidades declaradas.

## Limitações

CORS não é autenticação; ele restringe browsers, não clientes não-browser. Rate limit por IP é apenas uma proteção básica. Watch Party usa salas temporárias e limite de participantes/mensagens, mas não equivale a uma plataforma social autenticada; evite compartilhar dados pessoais no chat. Para uma implantação pública maior, adicione autenticação, quotas por usuário, métricas, alertas e revisão independente de SSRF.

O frontend não recebe o token TMDB. A API não armazena credenciais de addons. A rota de transcodificação só abre mídia HTTPS pública com DNS pinning, sem redirects; URLs assinadas que redirecionam e fontes com cabeçalhos privados não funcionam. Configure `PUBLIC_API_BASE_URL` para formar as URLs HLS sem confiar no cabeçalho Host do pedido. Os cabeçalhos CORS aceitos incluem `X-MDBList-Key` e `X-PublicMetaDB-Key` para as integrações por sessão. Essas chaves não devem ser incluídas no snapshot de sincronização.


## P2P no navegador

O cliente WebTorrent conecta-se diretamente a peers e trackers configurados no frontend. Isso não passa pelo backend e também significa que peers/trackers podem observar o infoHash anunciado e metadados de rede. WebRTC pode revelar endereços de rede conforme as políticas ICE do navegador. Informe o usuário antes de iniciar uma sessão, permita que ele encerre a sessão saindo do player e não adicione catálogo ou indexador de torrents ao backend. A implementação atual só inicia P2P a partir de dados inseridos pelo usuário ou retornados pelos addons que ele instalou.


## Painel administrativo e analytics

- `ADMIN_API_KEY` é segredo exclusivo da API Render; nunca use prefixo `VITE_`. O backend verifica comprimento mínimo de 32 caracteres e usa comparação de tempo constante.
- A chave é mantida apenas em `sessionStorage` no navegador administrativo e enviada em `X-Admin-Api-Key`; encerrar a sessão ou sair do dashboard remove o valor local.
- Analytics permanece desativado por padrão e só envia eventos allowlist se o usuário ativar a opção. Não inclui endereço IP, e-mail, texto de busca, ID de mídia, título, magnet URI, URL de stream ou tokens.
- O painel apresenta referências de usuário truncadas e não consulta e-mails. Configure política de retenção e acesso ao PostgreSQL na produção.
- O feed de addons passa pelo fetch seguro da API e é limitado em tamanho/quantidade; cada manifest continua sendo revalidado. O projeto não importa automaticamente diretórios comunitários inteiros.


## Host Android

O host usa AndroidX `WebMessageListener` e `addDocumentStartJavaScript` com origem HTTPS exata e só aceita mensagens do frame principal. Não usa `addJavascriptInterface`. O host bloqueia navegação principal para outras origens, conteúdo misto e erros TLS ignorados. A origem Vercel continua sendo uma dependência confiável; uma vulnerabilidade XSS nessa origem ainda poderia enviar comandos limitados de playback. Não adicione interfaces para filesystem, shell, intents arbitrários ou leitura de dados locais.

## Limites operacionais da transcodificação

A rota FFmpeg é aberta por rate limit por IP e limite de concorrência por processo; isso não substitui autenticação/quota por conta. Use instância única com memória/CPU monitoradas. Sessões estão em memória e diretórios temporários locais, logo reinício, scale-out, deploy ou suspensão do serviço interrompem a reprodução. Não use essa rota para DRM, torrentes, playlists HLS, URLs com redirect, fontes que exigem cookies/tokens/referrer, nem arquivos sem tipo de vídeo identificável.
