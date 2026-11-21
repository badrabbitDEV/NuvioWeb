# Como contribuir

1. Use Node.js 22+ e npm.
2. Instale dependências na raiz com `npm install`.
3. Rode `npm run typecheck` e `npm run build` antes de enviar mudanças.
4. Não inclua tokens, `.env`, URLs privadas ou arquivos de mídia protegidos.
5. Mantenha compatibilidade com teclado, touch, leitores de tela e larguras de 360 px a desktop.
6. Ao adicionar uma função Enhanced, documente o comportamento e atualize `docs/FEATURE_MATRIX.md`.
7. Não implemente proxy de mídia irrestrito. Qualquer fetch externo precisa de revisão de segurança.

Pull requests devem explicar: o problema, a solução, como testar e quais navegadores foram verificados.
