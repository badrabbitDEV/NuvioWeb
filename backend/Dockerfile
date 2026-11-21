FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=4000 \
    FFMPEG_PATH=ffmpeg

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'libx264'

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json ./package.json
COPY --chown=node:node backend/package.json ./backend/package.json
COPY --chown=node:node frontend/package.json ./frontend/package.json
RUN npm install --workspace @nuvio/api --include-workspace-root=false --no-audit --no-fund --ignore-scripts
COPY --chown=node:node backend ./backend
RUN npm run build --workspace @nuvio/api

EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start", "--workspace", "@nuvio/api"]
