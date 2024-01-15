import http from 'http';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';

import router from './src/router.js';
import {websockets} from './src/websocket.js';
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {receiveCallFromIOS} from './src/coordinator.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express webapp
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.use(router);

// Create http server and run it
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const wss = websockets(server);
app.post('/callback', (req, res)=>{
  console.log('callback from twilio');
  console.log(req.body);
  res.sendStatus(200);
});
app.get('/call-admin', (req, res)=>{
  receiveCallFromIOS(wss, res);
});
server.listen(port, function() {
  console.log('Express server running on *:' + port);
});
