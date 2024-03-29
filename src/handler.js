const VoiceResponse = require('twilio').twiml.VoiceResponse;
const AccessToken = require('twilio').jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

const nameGenerator = require('../name_generator');
const config = require('../config');
const client = require('twilio')(config.accountSid, config.authToken);
const apn = require('apn');

let identity;

exports.tokenGenerator = function tokenGenerator(mod) {
  identity = mod ? 'Moderator' : nameGenerator();

  const accessToken = new AccessToken(
      config.accountSid,
      config.apiKey,
      config.apiSecret
  );
  accessToken.identity = identity;
  const grant = new VoiceGrant({
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

exports.voiceResponse = function voiceResponse(requestBody) {
  const toNumberOrClientName = requestBody.To;
  const callerId = config.callerId;
  const twiml = new VoiceResponse();

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

exports.conferenceResponse = function conferenceResponse(requestBody) {
  const twiml = new VoiceResponse();

  const dial = twiml.dial();
  const MODERATOR = 'Moderator';
  console.log(`requestBody: `, requestBody);

  if (requestBody.From == `client:${MODERATOR}`) {
    dial.conference('My conference', {
      startConferenceOnEnter: true,
      endConferenceOnExit: true,
    });
  } else {
    dial.conference('My conference', {
      startConferenceOnEnter: true,
    });
    // addUserToConference(requestBody.From, 'My conference', requestBody.From);
  }

  return twiml.toString();
};

exports.mergeCall = function mergeCall(requestBody) {
  console.log(`mergeCall: `, requestBody);
  client.conferences.list({status: 'in-progress'})
      .then((conferences) => {
        const cf = conferences.filter(
            (c)=>c.friendlyName == 'My conference')[0];
        console.log(cf);
        if (cf) {
          addUserToConference(requestBody.To, cf.sid, requestBody.To);
          return cf.sid;
        } else {
          console.log('no active conference');
          return null;
        }
      }).catch(e=>{
        console.log(e);
      });
  return null;
};

exports.sendVoipNotification = function sendVoipNotification(requestBody) {
  var options = {
    token: {
      key: `${__dirname}/AuthKey_NB4J46P3Q4.p8`,
      keyId: "NB4J46P3Q4",
      teamId: "657V37PLVJ"
    },
    production: false
  };
  
  var apnProvider = new apn.Provider({
    cert: `${__dirname}/voip_jumpstg.pem`,
    key: `${__dirname}/AuthKey_NB4J46P3Q4.pem`,
    ...options
  });

  var note = new apn.Notification();

  note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
  note.badge = 3;
  note.sound = "ping.aiff";
  note.alert = "You have a new call";
  note.payload = {
    "aps": { "content-available": 1 },
    'callerName': "dog","roomName": "dog room"
  };
  note.topic = "link.jumpapp.psa.stg.voip";
  note.priority = 10;
  note.pushType = "alert";

  console.log(requestBody.deviceToken)
  apnProvider.send(note, requestBody.deviceToken)
    .then( (result) => {
      console.log(" Push send result: " + JSON.stringify(result))
    })
    .catch(error => {
      console.log(error)
    })
}

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
      .catch((e)=>console.log(e));
}
