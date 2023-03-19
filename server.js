import cors from 'cors'
import express from "express"
import * as http from 'http'
import { Server } from 'socket.io'
import AdminService from "./Service/AdminService.js"

const app = express();
app.use(cors);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://dash.vocco.ai",
    methods: ['GET', 'POST']
  }
});

const vc_users = [];
const dash_users = [];
const users_byId = [];
const birdRooms = [
  {
    "categoryId": 3,
    "hostUser": {
      "avatar": {
        "id": "5f49d05d-980b-469e-a247-2a0ad632ce3c", "key": "23a49eef-4719-4311-989d-323514f4c893-avatar", "type": "image", "url": "https://vodienstorage.s3.sa-east-1.amazonaws.com/%F0%9F%99%8F%F0%9F%8F%BD.png"
      },
      "avatarNumber": 0,
      "id": "68263edd-fe69-4d13-b441-f0d6ae5f0c40",
      "name": "Vodeus",
      "score": 80000
    }, "participants": [],
    "roomId": "89442009-efba-4024-9f6a-5bf9fdfa0128",
    "title": "Love for God"
  },
];

io.on("connection", (socket) => {

  const onDeleteRoom = (roomId) => {
    let index = birdRooms.findIndex(el => (el.roomId == roomId));
    if (index != -1) {
      io.to("appRoom").emit("deleteBirdRoom", { info: { roomId } });
      AdminService.deleteBirdRoom(roomId);
      birdRooms.splice(index, 1);
    }
  }

  const onExitRoom = (roomId, participantId, userId) => {
    let index = birdRooms.findIndex(el => (el.roomId == roomId));
    if (index != -1) {
      let p_index = birdRooms[index].participants.findIndex(el => (el.participantId == participantId));
      if (p_index != -1) {
        birdRooms[index].participants.splice(p_index, 1);
        io.to("appRoom").emit("exitBirdRoom", { info: { roomId, participantId } });
      }
      if (users_byId[userId]) {
        users_byId[userId].roomId = null;
        users_byId[userId].participantId = null;
      }
      if ((birdRooms[index].hostUser.id == userId || birdRooms[index].participants.length == 0) && birdRooms[index].hostUser.id != '68263edd-fe69-4d13-b441-f0d6ae5f0c40')
        birdRooms[index]['delay'] = setTimeout(() => {
          onDeleteRoom(roomId);
        }, 30000);
    }
  }

  socket.on("login", ({ uid, email, isNew }, callback) => {
    console.log("Login: ", uid);
    const selfIndex = vc_users.findIndex((e_user) => e_user.id === socket.id);
    if (selfIndex != -1 || (users_byId[uid] && users_byId[uid].last_seen == 'onSession')) {
      callback("Already login");
    }
    else {
      vc_users.push({ id: socket.id, user_id: uid, user_email: email });
      if (isNew && !users_byId[uid])
        io.to("dashRoom").emit("subscribe_user", { email });
      users_byId[uid] = { id: socket.id, user_id: uid, user_email: email, first_seen: new Date(), last_seen: "onSession", roomId: null, participantId: null };
      callback("Success");
      socket.broadcast.emit("user_login", { user_id: uid, v: 'onSession' });
      socket.join("appRoom");
    }
  });

  socket.on("dash_login", ({ uid }) => {
    const selfIndex = dash_users.findIndex((e_user) => e_user.id === socket.id);
    if (selfIndex == -1) {
      dash_users.push({ id: socket.id });
      socket.join("dashRoom");
    }
  });

  socket.on("premium", ({ email }) => {
    io.to("dashRoom").emit("premium", { email });
  });

  socket.on("getUsersState", (userIds, callback) => {
    try {
      callback(userIds.map((item) => {
        if (users_byId[item])
          return users_byId[item].last_seen;
        return null;
      }))
    }
    catch (err) {
      console.log(err);
    }
  });

  socket.on("getBirdRooms", (callback) => {
    let tp = birdRooms.map(el => {
      return {
        hostUser: el.hostUser,
        roomId: el.roomId,
        title: el.title,
        categoryId: el.categoryId,
        participants: el.participants
      }
    })
    try {
      callback(tp);
    }
    catch (err) {
      console.log(err);
    }
  });

  socket.on("createRoom", ({ info }) => {
    birdRooms.unshift(info);
    if (users_byId[info.hostUser.id]) {
      users_byId[info.hostUser.id].roomId = info.roomId;
    }
    io.to("appRoom").emit("createBirdRoom", { info });
    io.to("appRoom").emit("new_room", { info });
  });

  socket.on("enterRoom", ({ info }) => {
    let index = birdRooms.findIndex(el => (el.roomId == info.roomId));
    if (index != -1) {
      if (birdRooms[index]?.delay) {
        clearTimeout(birdRooms[index].delay);
      }
      let p_index = birdRooms[index].participants.findIndex(el => el.participantId == info.participantId);
      if (p_index == -1) {
        birdRooms[index].participants.push(info);
        if (users_byId[info.user.id]) {
          users_byId[info.user.id].roomId = info.roomId;
          users_byId[info.user.id].participantId = info.participantId;
        }
        io.to("appRoom").emit("enterBirdRoom", { info });
      }
    }
  });

  socket.on("exitRoom", ({ info }) => {
    onExitRoom(info.roomId, info.participantId, info.user.id);
  });

  socket.on("kickUser", ({ userId }) => {
    let kickUser = users_byId[userId];
    if (kickUser && kickUser.last_seen == 'onSession') {
      io.to(kickUser.id).emit("kicked");
    }
  });

  socket.on("newVoice", ({ uid }) => {
    io.to("appRoom").emit("notice_Voice", { id: socket.id, user_id: uid });
  });

  socket.on("newMessage", ({ info }) => {
    let receiveUser = users_byId[info.toUser.id];
    if (receiveUser && receiveUser.last_seen == 'onSession') {
      io.to(receiveUser.id).emit("receiveMessage", { info: info });
      io.to("appRoom").emit("chatState", { fromUserId: info.user.id, toUserId: info.toUser.id, state: info.type, emoji: info.emoji });
    }
  });

  socket.on("chatState", ({ fromUserId, toUserId, state }) => {
    let receiveUser = users_byId[toUserId];
    if (receiveUser && receiveUser.last_seen == 'onSession') {
      io.to("appRoom").emit("chatState", { fromUserId, toUserId, state });
    }
  });

  //when the user exits the server
  socket.on("disconnect", () => {
    let index = vc_users.findIndex((e_user) => e_user.id === socket.id);
    if (index !== -1) {
      let userId = vc_users[index].user_id;
      if (users_byId[userId]) {
        users_byId[userId].last_seen = new Date();
        let num = Math.ceil((users_byId[userId].last_seen - users_byId[userId].first_seen) / 1000);
        let payload = {
          id: userId,
          sessionTime: num
        }
        AdminService.addSession(payload);
        if (users_byId[userId].roomId) {
          onExitRoom(users_byId[userId].roomId, users_byId[userId].participantId, userId);
        }
        socket.broadcast.emit("user_login", { user_id: userId, v: users_byId[userId].last_seen });
      }
      vc_users.splice(index, 1);
      socket.leave("appRoom");
    }
    else {
      index = dash_users.findIndex((e_user) => e_user.id === socket.id);
      if (index != -1) {
        dash_users.splice(index, 1);
        socket.leave("dashRoom");
      }
    }
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, err => {
  if (err) throw err;
  console.log("Server running: PORT:" + PORT);
});