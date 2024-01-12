/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {default as twilio} from 'twilio';
import nameGenerator from '../name_generator.js';
import config from '../config.js';
import twilioClient from 'twilio';
import {updateIdentityMap} from './coordinator.js';

const client = twilioClient(config.accountSid, config.authToken);

let identity;

const availableConferences = ['My conference 2', 'My conference'];
// @type {Array<{roomId: string, data: {type: string, action: string, from: string, to: string, conference: string}}>}
const activeAdmins = [];
const identityMap = new Map();
// @type {Array<{conferenceName: string, admin: string, users: Array<{userId: string}>}>}
const activeRooms = [];


export function tokenGenerator(mod) {
  identity = mod ? 'Moderator' : nameGenerator();

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
  const MODERATOR = 'Moderator';
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
  console.log(`returning current conference info`);
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
export function broadcastConferenceInfo(wss, info) {
  console.log('broadcasting conference info');
  wss.clients.forEach((client) => {
    activeAdmins.filter((a)=>a.data.adminId == client.roomId).map(async (a)=>{
      // get the current conference info and send it to the admin
      let list = [];
      let participants = [];
      list = await client.conferences.list({
        friendlyName: 'My conference',
        status: 'in-progress',
      });
      console.log(list);
      if (list.length == 1) {
        participants = await client.conferences(list[0].sid).participants.list();
      }
      sendWSMessage({
        roomId: message.data.from,
        data: {
          action: 'conferenceInfoUpdate',
          conference: list[0],
          participants: participants,
        },
      }, wss);
    });
  });
}
/**
 * @param {object} message
 * @param {WebSocketServer} wss
 */
export async function handleSystemMessage(message, wss) {
  console.log('handling system message', message);
  if (message.data.type == 'admin') {
    if (message.data.action == 'register') {
      // admin initiated the device and we register it into active admin list
      activeAdmins.push(message);
      console.log('activeAdmins', activeAdmins);
      const chosenConference = availableConferences.pop();
      if (!chosenConference) return;
      activeRooms.push({
        conferenceName: chosenConference,
        admin: message.data.adminId,
        users: [],
        status: 'available',
      });
      console.log('active rooms', activeRooms);
      // send conference info to the admin
      sendWSMessage({
        roomId: message.data.adminId,
        data: {
          action: 'conferenceNameUpdate',
          conference: chosenConference,
        },
      }, wss);
    } else if (message.data.action == 'accept') {
      // admin accept the incoming from user, so we inform user to join the conference now
      // send user to the active room
      console.log('admin accepted the call', message.data.from);
      const room = activeRooms.filter((r) => r.admin == message.data.to)[0];
      if (room) {
        room.users.push({
          userId: message.data.from,
        });
        sendWSMessage({
          roomId: message.data.from,
          data: {
            action: 'allowedToJoin',
            conference: room.conferenceName,
            from: message.data.from,
            to: message.data.to,
            type: 'coordinator',
          },
        }, wss);
      }
      // updated room
      console.log('updated room', activeRooms);
      sendWSMessage({
        roomId: message.data.to,
        data: {
          action: 'conferenceInfoUpdate',
          room: room,
        },
      }, wss);
    } else if (message.data.action == 'call') {
      // admin call the user
      console.log('admin is calling user ', message.data.to);
      sendWSMessage({
        roomId: message.data.to,
        data: {
          action: 'incoming',
          from: message.data.from,
          to: message.data.to,
          type: 'coordinator',
        },
      }, wss);
    } else if (message.data.action == 'conferenceInfoUpdate') {
      // get the current conference info and send it to the admin
      const activeRoom = activeRooms.filter((r)=>r.admin == message.data.adminId)[0];
      sendWSMessage({
        roomId: message.data.from,
        data: {
          action: 'conferenceInfoUpdate',
          room: activeRoom,
        },
      }, wss);
    } else if (message.data.action == 'hold') {
      // hold the participant
      console.log('hold request data', message.data);
      // find the active room associated with the admin
      const room = activeRooms.filter((r) => r.admin == message.data.to)[0];
      if (room) {
        const list = await client.conferences.list({
          friendlyName: room.conferenceName,
          status: 'in-progress',
        });
        console.log(list);
        if (list.length == 1) {
          const conferenceId = list[0].sid;
          holdParticipant({
            conference: conferenceId,
            participant: identityMap.get(`client:${message.data.userId}`),
            value: message.data.value,
          });
        }
      }
    } else if (message.data.action == 'reject') {
      // admin reject the call from the user
      console.log('admin rejected the call', message.data.from);
      // find the current room and make it as available
      const index = activeRooms.findIndex((r)=>r.admin == message.data.to);
      if (index > -1) {
        activeRooms[index].status = 'available';
      }
      sendWSMessage({
        roomId: message.data.from,
        data: {
          action: 'rejected',
          from: message.data.from,
          to: message.data.to,
          type: 'coordinator',
        },
      });
      console.log('--------- active rooms -------');
      console.log(activeRooms);
      console.log('--------- end -------');
    }
  } else if (message.data.type == 'user') {
    if (message.data.action == 'call') {
      // user call the admin
      const callabelRooms = activeRooms.filter((r) => r.status == 'available');
      if (callabelRooms.length > 0) {
        const admin = callabelRooms[0].admin;
        console.log('sending incoming message to active admin', admin);
        sendWSMessage({
          roomId: admin,
          data: {
            action: 'incoming',
            from: message.data.from,
            to: admin,
            type: 'coordinator',
          },
        }, wss);
        // find the admin room  and make it as busy
        const index = activeRooms.findIndex((r)=>r.admin == admin);
        if (index > -1) {
          activeRooms[index].status = 'busy';
        }
        console.log('--------- active rooms -------');
        console.log(activeRooms);
        console.log('--------- end -------');
      } else {
        console.log('no active admin');
      }
    } else if (message.data.action == 'accept') {
      // user accept the incoming from admin, so we inform admin to join the conference now
      console.log('user accepted the call', message.data.from);
      const room = activeRooms.filter((r) => r.admin == message.data.from)[0];
      if (room) {
        room.users.push({
          userId: message.data.from,
        });
        // send allow to join message to user
        sendWSMessage({
          roomId: message.data.to,
          data: {
            action: 'allowedToJoin',
            conference: room.conferenceName,
            from: message.data.from,
            to: message.data.to,
            type: 'coordinator',
          },
        }, wss);
        // send allow to join message to admin
        sendWSMessage({
          roomId: message.data.from,
          data: {
            action: 'allowedToJoin',
            conference: room.conferenceName,
            from: message.data.from,
            to: message.data.to,
            type: 'coordinator',
          },
        }, wss);
      }
      // updated room
      console.log('updated room', activeRooms);
      sendWSMessage({
        roomId: message.data.from,
        data: {
          action: 'conferenceInfoUpdate',
          room: room,
        },
      }, wss);
    } else if (message.data.action == 'reject') {
      // user reject the call from the admin
      console.log('admin rejected the call', message.data.from);
      // find the current room and make it as available
      const index = activeRooms.findIndex((r)=>r.admin == message.data.from);
      if (index > -1) {
        activeRooms[index].status = 'available';
      }
      sendWSMessage({
        roomId: message.data.from,
        data: {
          action: 'rejected',
          from: message.data.from,
          to: message.data.to,
          type: 'coordinator',
        },
      });
      console.log('--------- active rooms -------');
      console.log(activeRooms);
      console.log('--------- end -------');
    }
  }
}

/**
 * @param {object} message
 * @param {WebSocketServer} wss
 */
export function sendWSMessage(message, wss) {
  console.log('sending message', message);
  wss.clients.forEach((client) => {
    if (client.roomId?.toString() == message.roomId?.toString()) {
      console.log(`sending to ${client.roomId}`);
      client.send(JSON.stringify(message));
    }
  });
}


export function handleClosedWebSocketConnections(roomId) {
  const room = activeRooms.findIndex((r)=>r.admin == roomId);
  if (room > -1) {
    availableConferences.push(activeRooms[room].conferenceName);
    activeRooms.splice(room, 1);
    console.log('--------- active rooms -------');
    console.log(activeRooms);
    console.log('--------- available conferences -------');
    console.log(availableConferences);
    console.log('--------- end -------');
  }
}
