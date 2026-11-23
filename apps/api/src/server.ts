import { buildApp } from './app';
import { env } from './config/env';
import { disconnectDatabase } from './common/database/prisma';

const app = buildApp();

async function start(): Promise<void> {
  try {
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    app.log.info(`Prakaro API server listening at ${address} in ${env.NODE_ENV} mode`);
  } catch (err) {
    app.log.error({ errorName: err instanceof Error ? err.name : 'Unknown' }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown handling
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
let shuttingDown = false;

for (const signal of signals) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const deadline = setTimeout(() => {
      app.log.error('Server shutdown deadline exceeded');
      process.exit(1);
    }, 25_000);
    app.log.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await app.close();
      await disconnectDatabase();
      clearTimeout(deadline);
      app.log.info('Server closed successfully.');
      process.exit(0);
    } catch (err) {
      app.log.error({ errorName: err instanceof Error ? err.name : 'Unknown' }, 'Error occurred during graceful shutdown');
      process.exit(1);
    }
  });
}

process.on('unhandledRejection', (reason) => {
  app.log.error({ errorName: reason instanceof Error ? reason.name : 'Unknown' }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (error) => {
  app.log.fatal({ errorName: error.name }, 'Uncaught Exception');
  process.exit(1);
});

void start();
