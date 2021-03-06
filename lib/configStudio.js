const _ = require('lodash');
const bodyParser = require('body-parser');
const chalk = require('chalk');
const expressWs = require('express-ws');
const rekit = require('rekit-core');
const helpers = require('./helpers');
const logger = require('./logger');

function setupWebSocket(app) {
  const sockets = [];
  app.ws('/rekit-studio-socket', (ws, req) => {
    ws.on('close', () => _.pull(sockets, ws));
    sockets.push(ws);
  });

  return {
    emit(type, msg) {
      if (typeof type === 'object' && !msg) {
        // dispatch a redux action to clients directly
        msg = type;
        type = 'reduxAction';
      }
      sockets.forEach(socket => {
        try {
          socket.send(
            JSON.stringify({
              type,
              payload: msg,
            }),
          );
        } catch (e) {
          // ignore socket send error
        }
      });
    },
  };
}

function configStudio(server, app, args) {
  args = args || {};
  expressWs(app, server, {
    wsOptions: {
      noServer: true,
      perMessageDeflate: false,
    },
  });
  app.use(bodyParser.json({ limit: '5MB' }));
  app.use(bodyParser.urlencoded({ extended: true }));

  const io = setupWebSocket(app);
  // setupLsp(server, app);

  args.io = io;
  app.use((req, res, next) => {
    helpers.startOutputToClient(io);
    res.on('finish', () => {
      helpers.stopOutputToClient();
    });
    next();
  });

  rekit.core.plugin.getPlugins('studio.config').forEach(p => {
    p.studio.config(server, app, args);
  });

  rekit.core.app.getProjectData(); // this is used to start watch project files.

  // General error handler
  app.use(function(err, req, res, next) {
    if (res.headersSent) {
      next(err);
      return;
    }
    res.statusCode = 500;
    res.write(err.message || 'Unknown error');
    res.write('\n');
    if (err.stack) {
      res.write(err.stack);
      logger.info('Request failed: ', err);
      err.stack.split('\n').forEach(line => console.log(chalk.red(line)));
    }
    res.end();
  });
}

module.exports = configStudio;
