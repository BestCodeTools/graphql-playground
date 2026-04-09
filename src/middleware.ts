import express, { Router } from 'express';
import path from 'node:path';

export interface MiddlewareOptions {
  path: string,
}

const playgroundMiddleware = (options: MiddlewareOptions) => {
  const router = Router();
  const publicPath = path.join(__dirname, '../public');
  const enableLiveReload = process.env.PLAYGROUND_LIVE_RELOAD === 'true' && process.env.NODE_ENV !== 'production';

  if (enableLiveReload) {
    // Load live reload dependencies only in development mode.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const livereload = require('livereload');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const connectLivereload = require('connect-livereload');
    const liveReloadServer = livereload.createServer();

    liveReloadServer.watch(publicPath);
    router.use(options.path, connectLivereload(), express.static(publicPath));
    liveReloadServer.server.once('connection', () => {
      setTimeout(() => {
        liveReloadServer.refresh('/');
      }, 100);
    });

    return router;
  }

  router.use(options.path, express.static(publicPath));
  return router;
};

export default playgroundMiddleware;
