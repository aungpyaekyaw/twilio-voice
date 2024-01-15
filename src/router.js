const Router = require('express').Router;
const {tokenGenerator, voiceResponse,
  conferenceResponse,
  mergeCall,
  sendVoipNotification} = require('./handler');

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

router.post('/merge', (req, res)=>{
  res.send(mergeCall(req.body));
});

router.post('/call-voip', (req, res) => {
  res.send(sendVoipNotification(req.body))
})

module.exports = router;