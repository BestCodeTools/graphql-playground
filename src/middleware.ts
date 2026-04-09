import express, { Router } from 'express';
import path from 'node:path';
import livereload from 'livereload';
import connectLivereload from 'connect-livereload';

export interface MiddlewareOptions {
  path: string,
}



const playgroundMiddleware = (options: MiddlewareOptions) => {
  const router = Router();
  const liveReloadServer = livereload.createServer();
  liveReloadServer.watch(path.join(__dirname, '../public')); // Observa mudanças na pasta "public"

  // app.use(); // Adiciona o script do LiveReload
  router.use(options.path, connectLivereload(), express.static(path.join(__dirname, '../public')));
  liveReloadServer.server.once('connection', () => {
    setTimeout(() => {
      liveReloadServer.refresh('/');
    }, 100);
  });
  return router;
};

export default playgroundMiddleware;