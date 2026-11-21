import { createServer } from 'node:http';
import { app } from './app.js';
import { config } from './config.js';
import { attachPartyWebSocket } from './party-ws.js';

const server = createServer(app);
attachPartyWebSocket(server);
server.listen(config.port, '0.0.0.0', () => {
  console.log(`[nuvio-api] listening on 0.0.0.0:${config.port} (${config.nodeEnv})`);
});

const shutdown = (signal: string) => {
  console.log(`[nuvio-api] ${signal}: closing server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
