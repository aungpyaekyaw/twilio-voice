/* eslint-disable no-unused-vars */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {WebSocketServer} from 'ws';
import queryString from 'query-string';
import {handleSystemMessage, handleClosedWebSocketConnections} from './coordinator.js';

export function websockets(expressServer) {
  const websocketServer = new WebSocketServer({
    noServer: true,
    path: '/websockets',
  });

  expressServer.on('upgrade', (request, socket, head) => {
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request);
    });
  });

  websocketServer.on(
      'connection',
      function connection(websocketConnection, connectionRequest) {
        const [_path, params] = connectionRequest?.url?.split('?');
        const connectionParams = queryString.parse(params);

        console.log(connectionParams);
        websocketConnection.roomId = connectionParams.roomId;

        websocketConnection.on('message', (message) => {
          try {
            const parsedMessage = JSON.parse(message);
            console.log(parsedMessage);
            // check if message has roomId
            if (!parsedMessage.roomId) {
              console.log('Message without roomId', parsedMessage);
              return;
            }

            // handle system messages
            if (parsedMessage.roomId == 'coordinator') {
              console.log('handling system message');
              handleSystemMessage(parsedMessage, websocketServer);
              return;
            }

            websocketServer.clients.forEach((client) => {
              if (client.roomId.toString() == parsedMessage.roomId.toString()) {
                console.log(`sending to ${client.roomId}`);
                client.send(JSON.stringify({roomId: client.roomId, data: parsedMessage.data}));
              }
            });
          } catch (e) {
            console.log('Error parsing message', e);
            console.log('Original message:', message);
          }
        });

        websocketConnection.on('close', (websocketConnection) => {
          console.log('websocket closed', connectionParams.roomId);
          handleClosedWebSocketConnections(connectionParams.roomId);
        });

        websocketConnection.on('error', (websocketConnection) => {
          console.log('websocket error');
        });
      },
  );

  return websocketServer;
};
