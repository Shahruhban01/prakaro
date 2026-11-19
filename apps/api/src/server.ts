import { buildApp } from './app';
import { env } from './config/env';

const app = buildApp();

async function start(): Promise<void> {
  try {
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    app.log.info(`Prakaro API server listening at ${address} in ${env.NODE_ENV} mode`);
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown handling
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await app.close();
      app.log.info('Server closed successfully.');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error occurred during graceful shutdown');
      process.exit(1);
    }
  });
}

process.on('unhandledRejection', (reason) => {
  app.log.error(reason, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (error) => {
  app.log.fatal(error, 'Uncaught Exception');
  process.exit(1);
});

void start();
