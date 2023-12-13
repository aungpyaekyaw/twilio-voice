const Router = require('express').Router;
const {tokenGenerator, voiceResponse,
  conferenceResponse} = require('./handler');

const router = new Router();

router.get('/token', (req, res) => {
  res.send(tokenGenerator());
});

router.get('/token/mod', (req, res) => {
  res.send(tokenGenerator(true));
});

router.post('/voice', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(voiceResponse(req.body));
});

router.post('/conference', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(conferenceResponse(req.body));
});

module.exports = router;
