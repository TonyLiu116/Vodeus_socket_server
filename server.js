import express from "express"
import cors from 'cors'
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
const birdRooms = [];

io.on("connection", (socket) => {

  socket.on("login", ({ uid, email, isNew }, callback) => {
    console.log("login:", uid);
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
    try {
      callback(birdRooms);
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
  });

  socket.on("deleteRoom", ({ info }) => {
    let index = birdRooms.findIndex(el => (el.roomId == info.roomId));
    if (index != -1)
      birdRooms.splice(index, 1);
    io.to("appRoom").emit("deleteBirdRoom", { info });
    AdminService.deleteBirdRoom(info.roomId);
  });

  socket.on("enterRoom", ({ info }) => {
    let index = birdRooms.findIndex(el => (el.roomId == info.roomId));
    if (index != -1) {
      let p_index = birdRooms[index].participants.findIndex(el => el.participantId == info.participantId);
      if (p_index == -1) {
        birdRooms[index].participants.push(info);
        if (users_byId[info.user.id]) {
          users_byId[info.user.id].roomId = info.roomId;
          users_byId[info.user.id].participantId = info.participantId;
        }
        birdRooms[index].participants.forEach(el => {
          let receiveUser = users_byId[el.user.id];
          if (receiveUser && receiveUser.last_seen == 'onSession') {
            io.to(receiveUser.id).emit("enterBirdRoom", { info });
          }
        })
      }
    }
  });

  socket.on("exitRoom", ({ info }) => {
    let index = birdRooms.findIndex(el => (el.roomId == info.roomId));
    if (index != -1) {
      let p_index = birdRooms[index].participants.findIndex(el => (el.participantId == info.participantId));
      if (p_index != -1) {
        if (users_byId[info.user.id]) {
          users_byId[info.user.id].roomId = null;
          users_byId[info.user.id].participantId = null;
        }
        birdRooms[index].participants.forEach(el => {
          let receiveUser = users_byId[el.user.id];
          if (receiveUser && receiveUser.last_seen == 'onSession') {
            io.to(receiveUser.id).emit("exitBirdRoom", { info });
          }
        });
        birdRooms[index].participants.splice(p_index, 1);
      }
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
          let index = birdRooms.findIndex(el => (el.roomId == users_byId[userId].roomId));
          if (index != -1) {
            if (birdRooms[index].hostUser.id == userId) {
              io.to("appRoom").emit("deleteBirdRoom", { info: { roomId: users_byId[userId].roomId } });
              AdminService.deleteBirdRoom(users_byId[userId].roomId);
              birdRooms.splice(index, 1);
            }
            else {
              let p_index = birdRooms[index].participants.findIndex(el => (el.participantId == users_byId[userId].participantId));
              if (p_index != -1) {
                birdRooms[index].participants.forEach(el => {
                  let receiveUser = users_byId[el.user.id];
                  if (receiveUser && receiveUser.last_seen == 'onSession') {
                    io.to(receiveUser.id).emit("exitBirdRoom", { info: { roomId: users_byId[userId].roomId, participantId: users_byId[userId].participantId } });
                  }
                });
                birdRooms[index].participants.splice(p_index, 1);
                users_byId[userId].roomId = null;
                users_byId[userId].participantId = null;
              }
            }
          }
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