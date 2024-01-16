/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

import config from '../config.js';
import twilioClient from 'twilio';
import {holdParticipant} from './handler.js';

const client = twilioClient(config.accountSid, config.authToken);

const availableConferences = ['My conference'];
// @type {Array<{roomId: string, data: {type: string, action: string, from: string, to: string, conference: string}}>}
const activeAdmins = [];
const identityMap = new Map();
// @type {Array<{conferenceName: string, admin: string, users: Array<{userId: string}>}>}
const activeRooms = [];

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
      const activeRoom = activeRooms.filter((r) => r.admin == message.data.adminId)[0];
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
      const room = activeRooms.find((r) => r.admin == message.data.from);
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
      clearTheRoom(message.data.to);
      sendWSMessage({
        roomId: message.data.from,
        data: {
          action: 'rejected',
          from: message.data.from,
          to: message.data.to,
          type: 'coordinator',
        },
      }, wss);
    } else if (message.data.action == 'hangup') {
      // admin hangup the call
      console.log('admin hangup the call', message.data.from);
      // find the current room and make it as available
      clearTheRoom(message.data.to);
      sendWSMessage({
        roomId: message.data.from,
        data: {
          action: 'hangup',
          from: message.data.from,
          to: message.data.to,
          type: 'coordinator',
        },
      }, wss);
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
        const index = activeRooms.findIndex((r) => r.admin == admin);
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
      clearTheRoom(message.data.from);
      sendWSMessage({
        roomId: message.data.from,
        data: {
          action: 'rejected',
          from: message.data.from,
          to: message.data.to,
          type: 'coordinator',
        },
      });
    } else if (message.data.action == 'hangup') {
      sendWSMessage({
        roomId: message.data.to,
        data: {
          action: 'hangup',
          from: message.data.from,
          to: message.data.to,
          type: 'coordinator',
        },
      }, wss);
      clearTheRoom(message.data.to);
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
  const room = activeRooms.findIndex((r) => r.admin == roomId);
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

export function updateIdentityMap(caller, callSid) {
  identityMap.set( caller, callSid);
  console.log(identityMap);
}

function clearTheRoom(adminId) {
  console.log('Room clear for ', adminId);
  const index = activeRooms.findIndex((r) => r.admin == adminId);
  if (index > -1) {
    // delete identity mapping
    identityMap.delete(`client:${adminId}`);
    activeRooms[index].users.map((u)=>{
      identityMap.delete(`client:${u.userId}`);
    });
    console.log('identity map', identityMap);
    activeRooms[index].status = 'available';
    activeRooms[index].users = [];
  }
  console.log('--------- active rooms -------');
  console.log(activeRooms);
  console.log('--------- end -------');
}

export function receiveCallFromIOS(wss, res) {
  console.log('Receiving call from ios');
  console.log(activeRooms);
  const room = activeRooms.find((r) => r.conferenceName == 'My conference');
  console.log(room);
  if (room) {
    room.users.push({
      userId: 'iOS',
    });
    // send allow to join message to admin
    sendWSMessage({
      roomId: room.admin,
      data: {
        action: 'allowedToJoin',
        conference: room.conferenceName,
        from: 'ios',
        to: room.admin,
        type: 'coordinator',
      },
    }, wss);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
}
