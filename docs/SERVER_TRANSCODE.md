# Decodificação no servidor — FFmpeg

## Fluxo

1. O player Web detecta erro de rede, decodificação ou formato não suportado em uma URL direta HTTPS.
2. Para arquivos comuns não-HLS, solicita `POST /api/v1/media/transcode`.
3. A API valida a URL, resolve DNS, rejeita qualquer IP privado/reservado, fixa os endereços no agente HTTP e bloqueia redirects.
4. Os bytes chegam ao FFmpeg por `stdin`; FFmpeg não faz fetch externo.
5. FFmpeg produz HLS temporário e progressivo (a playlist começa a aparecer antes do fim da conversão), com H.264/AAC e altura limitada.
6. O frontend reproduz playlist/segmentos e chama `DELETE /api/v1/media/sessions/:id` ao sair.

## Configuração

```env
FFMPEG_PATH=ffmpeg
PUBLIC_API_BASE_URL=https://SUA-API.onrender.com
MEDIA_TRANSCODE_ENABLED=true
MEDIA_MAX_CONCURRENT=1
MEDIA_SESSION_TTL_SECONDS=7200
MEDIA_MAX_INPUT_GB=12
MEDIA_MAX_DURATION_SECONDS=7200
MEDIA_MAX_HEIGHT=720
```

O Dockerfile instala FFmpeg e verifica se o encoder `libx264` existe. Em produção, `PUBLIC_API_BASE_URL` HTTPS é obrigatório. O limite de concorrência é por processo; rode uma instância apenas enquanto as sessões forem mantidas em memória.

## Fontes aceitas e não aceitas

Aceitas: arquivos diretos HTTPS servidos com Content-Type `video/*`, `application/mp4`, `application/octet-stream` ou `binary/octet-stream`, sem redirects, sem login privado e sem DRM. Como a fonte entra pelo `stdin` do FFmpeg, o contêiner precisa permitir leitura sequencial; MP4 com `moov atom` no início (`faststart`) é o formato mais adequado.

Não aceitas: MP4 não preparado para leitura sequencial (por exemplo, `moov atom` somente no fim), playlists HLS de entrada, DASH de entrada, magnets, torrents, links que redirecionem para CDN, URLs que dependam de cookies/Authorization/Referer, endereços privados ou DRM. HLS deve tocar no navegador por HLS.js/nativo. P2P deve tocar por WebTorrent no browser.

## Custos e operacionalidade

A transcodificação consome CPU, RAM, rede e espaço temporário. O plano gratuito pode não suportar transcodificação em tempo real, pode suspender e tem recursos limitados. O diretório e sessões são locais à instância e não sobrevivem a reinício/deploy; escala horizontal não é suportada por esta implementação. Para um serviço público, implemente autenticação e quota por usuário, worker/fila separada, armazenamento de segmentos compartilhado, limpeza por job, métricas e testes de carga antes de liberar amplamente.

## Teste executado nesta execução

A linha FFmpeg usada pela API foi testada localmente com um arquivo sintético de 28 segundos. A playlist apareceu após cerca de 6 segundos, antes do fim da conversão, e o primeiro segmento MPEG-TS já podia ser inspecionado. Também foram verificadas saídas landscape e portrait com altura limitada a 720p. Isso valida a linha de comando/encoder local e a saída HLS progressiva, não a rota Express, a conexão a uma origem real nem o deploy Render.
