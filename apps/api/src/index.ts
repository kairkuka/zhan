import { buildServer } from './server.js';
import { env } from './lib/env.js';

const host = env.API_HOST;
const port = env.API_PORT;

async function start() {
  const app = await buildServer();

  try {
    await app.listen({ host, port });
    app.log.info(`API listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
