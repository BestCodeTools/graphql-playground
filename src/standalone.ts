import express from 'express';
import middleware from './middleware';

const app = express();

app.use(middleware({ path: '/playground' }));

const port = process.env.PLAYGROUND_PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Server listening on port http://localhost:${port}/playground`);
});

export default server;