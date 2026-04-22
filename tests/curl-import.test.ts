import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

type CurlImportResult = {
  url: string;
  method: string;
  headers: string;
  query: string;
  variables: string;
};

type CurlImportService = {
  parse(input: string): CurlImportResult;
  tokenizeShell(input: string): string[];
};

function loadCurlImportService(): CurlImportService {
  const factories = new Map<string, unknown>();
  const controllers = new Map<string, unknown>();
  const app = {
    factory(name: string, definition: unknown) {
      factories.set(name, definition);
      return app;
    },
    controller(name: string, definition: unknown) {
      controllers.set(name, definition);
      return app;
    }
  };
  const angular = {
    module() {
      return app;
    }
  };
  const mainJsPath = path.join(__dirname, '..', 'public', 'js', 'main.js');
  const script = new vm.Script(fs.readFileSync(mainJsPath, 'utf8'), {
    filename: mainJsPath
  });

  script.runInNewContext({ angular, console });

  const definition = factories.get('CurlImportService');

  if (typeof definition !== 'function') {
    throw new Error('CurlImportService factory was not registered.');
  }

  return definition() as CurlImportService;
}

describe('CurlImportService', () => {
  it('imports a multiline shell curl command into GraphQL request fields', () => {
    const service = loadCurlImportService();
    const result = service.parse(`curl 'https://api.example.test/graphql' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer token-123' \\
  --data-raw '{"query":"query GetUser($id: ID!) { user(id: $id) { id name } }","variables":{"id":"42"}}'`);

    expect(result.url).toBe('https://api.example.test/graphql');
    expect(result.method).toBe('POST');
    expect(JSON.parse(result.headers)).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-123'
    });
    expect(result.query).toBe('query GetUser($id: ID!) { user(id: $id) { id name } }');
    expect(JSON.parse(result.variables)).toEqual({ id: '42' });
  });

  it('supports --url and equals-style shell options', () => {
    const service = loadCurlImportService();
    const result = service.parse(`curl --url=https://api.example.test/graphql --request=POST --header='X-Tenant-Id: acme' --data='{"query":"{ health }"}'`);

    expect(result.url).toBe('https://api.example.test/graphql');
    expect(result.method).toBe('POST');
    expect(JSON.parse(result.headers)).toEqual({
      'X-Tenant-Id': 'acme'
    });
    expect(result.query).toBe('{ health }');
  });
});
