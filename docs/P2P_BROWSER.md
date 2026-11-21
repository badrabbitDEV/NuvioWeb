# P2P no navegador — WebTorrent / WebRTC

O port usa WebTorrent v3.0.21 para criar um cliente P2P dentro do navegador. A sessão funciona diretamente com peers compatíveis usando WebRTC. A Render não recebe nem retransmite os blocos do torrent.

## Funcionalidades presentes

- Abrir magnet URI.
- Abrir infoHash (hex/base32).
- Abrir arquivo `.torrent` escolhido localmente.
- Reproduzir progressivamente arquivo de vídeo selecionado pelo `fileIdx` ou por extensão conhecida.
- Consumir fontes de addons que retornem `infoHash` ou magnet.
- Mostrar peers, progresso, volume transferido e taxas de download/upload.
- Semear arquivo local selecionado pelo usuário através de WebTorrent.

## Limites técnicos

1. Navegadores não oferecem sockets TCP/UDP arbitrários para páginas Web. WebTorrent usa WebRTC e não é compatível com todos os peers BitTorrent tradicionais.
2. A descoberta depende de trackers WebSocket (`wss://`) e da presença de peers WebTorrent/WebRTC ativos.
3. P2P deve ser testado em HTTPS ou `localhost`; Service Worker e WebRTC são requisitos.
4. Em Android/iOS, navegadores podem suspender/encerrar abas em background. Não há garantia de seed em background nem de transferência contínua com a tela bloqueada.
5. Codec e container do arquivo precisam ser aceitos pelo navegador. ExoPlayer/MPV não são carregados pelo WebTorrent.
6. Alguns torrents possuem mais de um arquivo; o índice correto deve vir do addon ou ser escolhido pelo usuário. O port escolhe o primeiro formato de vídeo reconhecido quando não há `fileIdx`.
7. A função seed compartilha o arquivo selecionado com a swarm. Interrompa a sessão ao terminar e não compartilhe documentos privados.

## Configuração de trackers

Na Vercel, defina opcionalmente `VITE_WEBTORRENT_TRACKERS` como uma lista separada por vírgulas de URLs `wss://` que você tenha autorização para usar. Essa variável é pública e será incluída no JavaScript entregue ao browser; não coloque tokens privados nela. O código valida o esquema `wss:`.

A aplicação possui uma lista padrão de descoberta WebTorrent no código. Trackers podem ficar indisponíveis ou bloquear determinadas origens; não há garantia de encontrar peers em cada torrent.

## Privacidade / uso autorizado

Um peer e um tracker podem observar o endereço IP e metadados necessários para encontrar/conectar peers e anunciar a atividade de torrent. Use somente arquivos criados por você, em domínio público ou para os quais tenha permissão explícita de compartilhar. O port não oferece arquivos nem catálogo de torrents.


## Compatibilidade com o fallback de mídia

O fallback FFmpeg do backend não recebe magnet URI, infoHash nem arquivo servido pela swarm. P2P continua sendo decodificado no navegador e necessita de um codec compatível. O host Android aceita somente URL HTTPS direta; não há ponte torrent→ExoPlayer/libmpv nesta versão.
