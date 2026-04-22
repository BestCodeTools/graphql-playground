import express, { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export interface MiddlewareOptions {
  path: string,
}

function findProjectFile(fileName: string) {
  const candidates = [
    path.join(__dirname, '..', fileName),
    path.join(__dirname, '..', '..', fileName),
    path.join(process.cwd(), fileName)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function getPackageVersion() {
  const packageJsonPath = findProjectFile('package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: string };

  return packageJson.version || '0.0.0';
}

const playgroundMiddleware = (options: MiddlewareOptions) => {
  const router = Router();
  const publicPath = findProjectFile('public');
  const enableLiveReload = process.env.PLAYGROUND_LIVE_RELOAD === 'true' && process.env.NODE_ENV !== 'production';

  router.get(`${options.path}/config.json`, (_request, response) => {
    response.json({
      appVersion: `v${getPackageVersion()}`
    });
  });

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
