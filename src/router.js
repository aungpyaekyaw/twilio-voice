/* eslint-disable new-cap */
import express from 'express';
import {tokenGenerator, voiceResponse,
  conferenceResponse,
  mergeCall,
  mergeConferences,
  getMyCurrentConferenceInfo,
  holdParticipant,
  sendVoipNotification} from './handler.js';

const router = express.Router();

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

router.post('/merge-conferences', (req, res)=>{
  res.send(mergeConferences(req.body));
});


router.get('/get-current-conference', async ( req, res)=>{
  res.send(await getMyCurrentConferenceInfo());
});

router.post('/hold', (req, res) =>{
  res.send(holdParticipant(req.body));
});

router.post('/call-ios-device', (req, res) =>{
  res.send(sendVoipNotification(req.body));
});

export default router;
