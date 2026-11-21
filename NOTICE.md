# Avisos e atribuições

Este é um projeto comunitário independente. Não é o aplicativo oficial Nuvio e não é afiliado, patrocinado ou suportado pelos mantenedores dos projetos de origem.

## Projetos de referência

- **Nuvio Mobile** — https://github.com/NuvioMedia/NuvioMobile — branch de referência consultada: `cmp-rewrite` — licença declarada: GNU GPL v3.0.
- **Nuvio Mobile Enhanced** — https://github.com/SpyGdev/NuvioMobile-Enhanced — branch de referência consultada: `enhanced` — licença declarada: GNU GPL v3.0.

Todo crédito pelo aplicativo original e pelo fork Enhanced pertence aos seus respectivos autores e contribuidores. Este port é uma implementação web comunitária; não implica endosso dos projetos originais.

## TMDB

Este produto usa a API do TMDB para metadados. Este produto não é endossado nem certificado pelo TMDB. Consulte https://www.themoviedb.org/documentation/api/terms-of-use.

## Conteúdo de mídia

O serviço não inclui, hospeda ou distribui arquivos de filmes, séries ou canais. O usuário configura suas próprias fontes e deve possuir autorização para acessar e reproduzir qualquer conteúdo disponibilizado por elas.


## WebTorrent browser transport

The browser P2P transport uses the WebTorrent npm package (MIT License) and its `dist/sw.min.js` service worker, copied into `frontend/public/sw.min.js` so the Vercel deployment can serve it from the application origin. WebTorrent project: https://github.com/webtorrent/webtorrent. A cópia integral da licença MIT está em `LICENSES/WebTorrent-MIT.txt`. The project also uses the community TypeScript declarations from `@types/webtorrent`.
