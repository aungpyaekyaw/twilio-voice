/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {default as twilio} from 'twilio';
import nameGenerator from '../name_generator.js';
import config from '../config.js';
import twilioClient from 'twilio';
import {updateIdentityMap} from './coordinator.js';
import apn from 'apn';
const client = twilioClient(config.accountSid, config.authToken);
import path from 'path';
import {fileURLToPath} from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let identity;

export function tokenGenerator(mod) {
  identity = mod ? 'Admin' : nameGenerator();

  console.log(`${config.accountSid} ${config.apiKey} ${config.apiSecret} ${config.twimlAppSid} ${config.authToken} `);

  const accessToken = new twilio.jwt.AccessToken(
      config.accountSid,
      config.apiKey,
      config.apiSecret,
  );
  accessToken.identity = identity;

  const grant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: config.twimlAppSid,
    incomingAllow: true,
  });
  accessToken.addGrant(grant);

  // Include identity and token in a JSON response
  return {
    identity: identity,
    token: accessToken.toJwt(),
  };
};

export function tokenOnlyGenerator() {
  identity = nameGenerator();
  const accessToken = new twilio.jwt.AccessToken(
      config.accountSid,
      config.apiKey,
      config.apiSecret,
  );
  accessToken.identity = identity;

  const grant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: config.twimlAppSid,
    incomingAllow: true,
  });
  accessToken.addGrant(grant);

  // Include identity and token in a JSON response
  return accessToken.toJwt();
}

export function voiceResponse(requestBody) {
  const toNumberOrClientName = requestBody.To;
  const callerId = config.callerId;
  const twiml = new twilio.twiml.VoiceResponse();

  // If the request to the /voice endpoint is TO your Twilio Number,
  // then it is an incoming call towards your Twilio.Device.
  if (toNumberOrClientName == callerId) {
    const dial = twiml.dial();

    // This will connect the caller with your Twilio.Device/client
    dial.client(identity);
  } else if (requestBody.To) {
    // This is an outgoing call

    // set the callerId
    const dial = twiml.dial({callerId});

    // Check if the 'To' parameter is a Phone Number or Client Name
    // in order to use the appropriate TwiML noun
    const attr = isAValidPhoneNumber(toNumberOrClientName) ?
      'number' :
      'client';
    dial[attr]({}, toNumberOrClientName);
  } else {
    twiml.say('Thanks for calling!');
  }

  return twiml.toString();
};

/**
 * Checks if the given value is valid as phone number
 * @param {Number|String} number
 * @return {Boolean}
 */
function isAValidPhoneNumber(number) {
  return /^[\d\+\-\(\) ]+$/.test(number);
}

export function conferenceResponse(requestBody) {
  const twiml = new twilio.twiml.VoiceResponse();

  const dial = twiml.dial();
  const MODERATOR = 'Admin';
  console.log(`requestBody: `, requestBody);

  const conference = requestBody.conference || 'My conference';

  if (requestBody.From == `client:${MODERATOR}`) {
    dial.conference(conference, {
      startConferenceOnEnter: true,
      endConferenceOnExit: true,
      participantLabel: requestBody.From,
    });
  } else {
    dial.conference(conference, {
      startConferenceOnEnter: true,
      participantLabel: requestBody.From,
    });
  }

  // save the identity map
  if (requestBody.Direction == 'inbound' && requestBody.Caller) {
    updateIdentityMap(requestBody.Caller, requestBody.CallSid);
  }

  return twiml.toString();
};

export function mergeCall(requestBody) {
  console.log(`mergeCall: `, requestBody);
  client.conferences.list({status: 'in-progress'})
      .then((conferences) => {
        const cf = conferences.filter(
            (c) => c.friendlyName == requestBody.conferenceId)[0];
        console.log(cf);
        if (cf) {
          addUserToConference(requestBody.To, cf.sid, requestBody.To);
          return cf.sid;
        } else {
          console.log('no active conference');
          return null;
        }
      }).catch((e) => {
        console.log(e);
      });
  return null;
};

export function mergeConferences(requestBody) {
  console.log(`merging conferences:`, requestBody);
  client.conferences(requestBody.awayConf).participants().update({
    conferenceSid: 'My conference',
  });
  return twiml.toString();
};

export function holdParticipant(requestBody) {
  console.log(`holding participant:`, requestBody);
  client.conferences(requestBody.conference)
      .participants(requestBody.participant)
      .update({hold: requestBody.value})
      .then((r)=>{
        console.log(r);
      }).catch((e)=>{
        console.log(e);
      });
};


export async function getMyCurrentConferenceInfo(requestBody) {
  console.log(`returning current conference info.`);
  let list = [];
  let participants = [];
  list = await client.conferences.list({
    friendlyName: 'My conference',
    status: 'in-progress',
  });
  console.log(list);
  if (list.length == 1) {
    participants = await client.conferences(list[0].sid).participants.list();
    return {
      conference: list[0],
      participants: participants,
    };
  }
  return null;
};


/**
 * Adds a user to a conference.
 *
 * @param {string} contact - The contact to add to the conference.
 * @param {string} conferenceName - The name of the conference.
 * @param {string} label - The label for the participant.
 */
function addUserToConference(contact, conferenceName, label) {
  console.log(`adding user ${contact} to conference: ${conferenceName}`);
  client.conferences(conferenceName)
      .participants.create({
        label: label,
        from: '+14122754751',
        to: contact,
        startConferenceOnEnter: true,
      }).then((participant) => console.log(participant.callSid))
      .catch((e) => console.log(e));
}

export function sendVoipNotification(requestBody) {
  const options = {
    token: {
      key: `${__dirname}/AuthKey_J8FTJQ43KP.p8`,
      keyId: 'J8FTJQ43KP',
      teamId: '657V37PLVJ',
    },
    production: false,
  };

  const apnProvider = new apn.Provider({
    // cert: `${__dirname}/voip_jumpstg.pem`,
    // key: `${__dirname}/AuthKey_J8FTJQ43KP.pem`,
    ...options,
  });

  const note = new apn.Notification();

  note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
  note.badge = 3;
  note.sound = 'ping.aiff';
  note.alert = 'You have a new call';
  note.payload = {
    'aps': {'content-available': 1},
    'callerName': 'dog', 'roomName': 'My conference',
    'token': tokenOnlyGenerator(),
  };
  // note.topic = 'link.jumpapp.psa.stg.voip';
  note.topic = 'link.jumpapp.psa.dev.voip'
  note.priority = 10;
  note.pushType = 'alert';

  console.log(requestBody.deviceToken);
  apnProvider.send(note, requestBody.deviceToken)
      .then( (result) => {
        console.log(' Push send result: ' + JSON.stringify(result));
      })
      .catch((error) => {
        console.log(error);
      });
};


