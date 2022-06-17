import express from "express"
import cors from 'cors'
import * as http from 'http'
import { Server } from 'socket.io'
import AdminService from "./Service/AdminService.js"
import e from "express"

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

io.on("connection", (socket) => {

  socket.on("login", ({ uid, email, isNew }, callback) => {
    const selfIndex = vc_users.findIndex((e_user) => e_user.id === socket.id);
    if (selfIndex != -1 || (users_byId[uid] && users_byId[uid].last_seen == 'onSession')) {
      callback("Already login");
    }
    else {
      vc_users.push({ id: socket.id, user_id: uid, user_email: email });
      if (isNew && !users_byId[uid])
        io.to("dashRoom").emit("subscribe_user", { email });
      users_byId[uid] = { id: socket.id, user_id: uid, user_email: email, first_seen: new Date(), last_seen: "onSession" };
      callback("Success");
      socket.broadcast.emit("user_login", { user_id: uid, v: 'onSession' });
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

  socket.on("newVoice", ({ uid }) => {
    socket.broadcast.emit("notice_Voice", { id: socket.id, user_id: uid });
  });

  socket.on("newMessage", ({ info }) => {
    let receiveUser = users_byId[info.toUser.id];
    if (receiveUser && receiveUser.last_seen == 'onSession') {
      io.to(receiveUser.id).emit("receiveMessage", { info: info });
    }
  });

  socket.on("chatState", ({ toUserId, state }) => {
    let receiveUser = users_byId[toUserId];
    if (receiveUser && receiveUser.last_seen == 'onSession') {
      io.to(receiveUser.id).emit("chatState", state);
    }
  });

  //when the user exits the server
  socket.on("disconnect", () => {
    let index = vc_users.findIndex((e_user) => e_user.id === socket.id);
    if (index !== -1) {
      let userId = vc_users[index].user_id;
      let user = users_byId[userId];
      if (user) {
        user.last_seen = new Date();
        let num = Math.ceil((user.last_seen - user.first_seen) / 1000);
        let payload = {
          id: userId,
          sessionTime: num
        }
        AdminService.addSession(payload);
        socket.broadcast.emit("user_login", { user_id: userId, v: user.last_seen });
      }
      vc_users.splice(index, 1);
    }
    else {
      index = vc_users.findIndex((e_user) => e_user.id === socket.id);
      if (index != -1) {
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