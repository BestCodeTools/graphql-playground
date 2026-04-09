import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

describe('standalone playground server', () => {
  let server: Server;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.PLAYGROUND_LIVE_RELOAD = 'false';
    process.env.PLAYGROUND_PORT = '0';

    const standaloneModule = await import('../src/standalone');
    server = standaloneModule.default;

    if (!server.listening) {
      await new Promise<void>((resolve) => {
        server.once('listening', () => resolve());
      });
    }
  });

  afterAll(async () => {
    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('serves the configured playground path with status 200', async () => {
    const address = server.address() as AddressInfo;

    const response = await new Promise<{ statusCode?: number; body: string }>((resolve, reject) => {
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: '/playground/',
          method: 'GET'
        },
        (result) => {
          let body = '';

          result.setEncoding('utf8');
          result.on('data', (chunk) => {
            body += chunk;
          });
          result.on('end', () => {
            resolve({
              statusCode: result.statusCode,
              body
            });
          });
        }
      );

      request.on('error', reject);
      request.end();
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<!DOCTYPE html>');
  });
});
