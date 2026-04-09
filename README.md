# GraphQL Playground

A standalone GraphQL Playground package with a custom dark UI, schema explorer, smart editors, workspace import/export, and Docker support.

## What This Package Is For

This package serves a browser-based GraphQL playground that helps developers:

- write and run GraphQL queries, mutations, and subscriptions
- inspect the schema in a side panel
- edit variables and headers with guided autocomplete
- view formatted JSON responses with syntax highlighting
- save, import, and export full workspaces with multiple tabs

It is designed to be embedded into an Express application or run as a standalone local server.

## Features

- standalone Express server for quick local usage
- custom schema viewer with search and hover details
- query editor with GraphQL autocomplete and inline tooltips
- variables editor with schema-aware suggestions
- headers editor with common header suggestions
- response viewer with JSON syntax highlighting
- multi-tab workspace with import/export support
- Docker image support for a compiled runtime

## Installation

```bash
npm install @bestcodetools/graphql-playground
```

## Standalone Usage

For development:

```bash
npm run standalone
```

The playground will be available at:

```text
http://localhost:3000/playground
```

You can change the port with:

```bash
PLAYGROUND_PORT=4000 npm run standalone
```

## Compiled Runtime

To run the compiled standalone server without `ts-node-dev`:

```bash
npm run build
npm start
```

## Docker Usage

Build the image:

```bash
docker build -t graphql-playground .
```

Run the container:

```bash
docker run -p 3000:3000 graphql-playground
```

Then open:

```text
http://localhost:3000/playground
```

## Available Scripts

- `npm run standalone`: starts the standalone server with `ts-node-dev`
- `npm run build`: transpiles TypeScript into `dist`
- `npm start`: runs the transpiled standalone server
- `npm test`: runs the Jest test suite
- `npm run transpile:sass:watch`: watches and transpiles Sass files

## Testing

This package includes a basic integration test for the standalone server.

Run:

```bash
npm test
```

The test verifies that the standalone server starts on an automatically assigned port and responds with `200` on the configured playground path.

## Notes

- The standalone runtime disables live reload in production mode.
- Workspace export sanitizes sensitive header values such as authorization, token, and key headers by replacing them with placeholders.

## License

ISC
