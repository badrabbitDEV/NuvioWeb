# Relatório de verificação — 1.0.4

Este relatório separa as verificações executadas nesta revisão de recursos que ainda dependem de dependências, serviços externos ou dispositivos reais.

## Verificações executadas nesta revisão

- Os oito módulos `frontend/src/features/{collections,downloads,live,notifications,party,profiles,servers,tracking}` receberam serviços, modelos ou componentes e arquivos `index.ts`.
- As páginas correspondentes foram ligadas aos módulos: Coleções, Downloads, TV ao Vivo, Watch Party, Perfis, Configurações/Notificações, Integrações e Player.
- O player agora aceita `blob:` apenas quando a rota foi marcada como offline, pula o host nativo e a transcodificação remota para esses arquivos e revoga a URL temporária ao sair da tela.
- Novos PINs de perfil usam PBKDF2-SHA-256 com salt aleatório e fator de trabalho; a verificação mantém compatibilidade com hashes SHA-256 da revisão anterior. O PIN permanece um bloqueio casual local, não autenticação forte.
- O typecheck estrito dos módulos TypeScript sem JSX foi executado com as declarações React mínimas temporárias usadas apenas para isolar os serviços; resultado sem erros.
- A análise sintática TypeScript/TSX do frontend foi executada em 60 arquivos, sem erros sintáticos.
- A verificação estática de 162 imports relativos no frontend não encontrou caminhos ausentes.
- Os arquivos JSON e o webmanifest alterados foram analisados, sem erros.

## Limites conhecidos dos módulos

- Downloads aceitam arquivos diretos HTTPS de até 500 MiB por item. O navegador precisa permitir CORS; o download usa memória temporária e IndexedDB, não é um gerenciador de downloads em background nem suporta torrents.
- XMLTV gzip depende de `DecompressionStream`; fontes externas e servidores de mídia dependem de CORS e compatibilidade do navegador.
- Watch Party depende do WebSocket da API. As salas são voláteis se o backend usar armazenamento em memória.
- Notificações do sistema dependem de permissão explícita do usuário. Não foi implementado envio Web Push no servidor.
- Jellyfin/Emby/Plex foram separados em serviços de acesso direto do browser; não foram validados contra instalações reais.
- Integrações Trakt/SIMKL dependem de credenciais reais e variáveis do backend.

## Verificações não realizadas

- `npm run typecheck`, `npm test` e `npm run build` completos: as dependências npm não estão instaladas nesta sessão e a resolução do registry falhou anteriormente. A análise sintática não substitui esses comandos.
- Testes de interface React com o conjunto real de tipos `@types/react` e componentes Lucide.
- Android: o host `native-android/` não foi compilado nem executado.
- Render/Vercel: não houve deploy, conexão a PostgreSQL real, configuração de variáveis ou teste HTTP externo.
- Teste de autenticação Jellyfin/Emby/Plex, OAuth Trakt/SIMKL, CORS de fontes reais, HLS/codec real, Watch Party multiusuário e swarm WebTorrent.

## Estado de lançamento

A versão 1.0.4 organiza e conecta os oito módulos de funcionalidades ao frontend. É uma revisão de código e estrutura, não uma build de produção validada. Antes de publicar, instale as dependências e execute `npm run typecheck`, `npm test` e `npm run build`; depois teste no Render, Vercel, Android e navegadores alvo.
