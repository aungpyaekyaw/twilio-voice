const VoiceResponse = require('twilio').twiml.VoiceResponse;
const AccessToken = require('twilio').jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

const nameGenerator = require('../name_generator');
const config = require('../config');
const e = require('express');
const client = require('twilio')(config.accountSid, config.authToken);

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
      startConferenceOnEnter: false,
    });
    // addUserToConference(requestBody.From, 'My conference', requestBody.From);
  }

  return twiml.toString();
};

exports.mergeCall = function mergeCall() {
  return client.conferences.list({status: 'in-progress'})
      .then((conferences) => {
        const cf = conferences.filter(
            (c)=>c.friendlyName == 'My conference')[0];
        console.log(cf);
        if (cf) {
          return cf.sid;
        } else {
          return null;
        }
      });
};


/**
 * Adds a user to a conference.
 *
 * @param {string} contact - The contact to add to the conference.
 * @param {string} conferenceName - The name of the conference.
 * @param {string} label - The label for the participant.
 */
function addUserToConference(contact, conferenceName, label) {
  console.log(`adding user to conference: ${contact}`);
  client.conferences(conferenceName)
      .participants.create({
        label: label,
        from: '_from',
        to: contact,
        startConferenceOnEnter: true,
      });
}
