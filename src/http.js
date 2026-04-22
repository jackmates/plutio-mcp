const { startHttpServer } = require('./server');

startHttpServer().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
