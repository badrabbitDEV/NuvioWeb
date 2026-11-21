# Política de segurança

Não publique tokens TMDB, credenciais de addons, URLs privadas ou dados pessoais em issues e pull requests.

Para relatar uma vulnerabilidade, use o recurso privado de advisories do GitHub no repositório que você controla. Não abra uma issue pública com detalhes exploráveis.

## Medidas já aplicadas

- API valida parâmetros e corpos com Zod.
- CORS aceita origens explicitamente configuradas.
- Helmet adiciona cabeçalhos de segurança.
- Rate limit global limita abuso básico.
- A consulta de addons bloqueia IPs privados/reservados, DNS não público, portas incomuns e redirecionamentos.
- Respostas JSON de addons têm limite de tamanho e timeout.
- Segredos TMDB existem somente no backend.

## Antes de abrir ao público

- Defina `CORS_ORIGINS` com todos e somente os domínios Vercel permitidos.
- Revise limites e plano da Render.
- Monitore erros e consumo da API.
- Considere autenticação/quotas adicionais se o serviço passar a atender terceiros em escala.
- Faça revisão independente de SSRF, DNS e dependências antes de tratar o proxy de addons como serviço de alta confiança.
