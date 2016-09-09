var clients = [];
var lobbies = {};
var lobby_id = 0;

function bc(type, data) {
  for (i in clients) {
    if (clients[i].lobby) continue;
    clients[i].socket.emit(type, data);
  }
}

function msgLobby(client, msg) {
  if (!client.lobby) return;
  for (i in client.lobby.players) {
    client.lobby.players[i].socket.emit('lobby', {'type': LOBBY_MSG, 'id': client.socket.id, 'msg': msg});
  }
}

function sendLobby(client, lobby) {
  client.socket.emit('lobby', {'type': LOBBY_CREATE, 'id': lobby.id, 'name': lobby.name});
}

function sendLobbies(client) {
  for (i in lobbies) sendLobby(client, lobbies[i]);
}

function createLobby(client, name) {
  // create our lobby
  var lobby = {id: lobby_id++, owner: client, name: name, players:[], state: 0};
  lobbies[lobby.id] = lobby;
  // notify all non-lobbied clients of new lobby
  for (i in clients) {
    if (clients[i].lobby) continue;
    sendLobby(clients[i], lobby);
  }
  joinLobby(client, lobby);
}

function claimLobby(client, lobby) {
  lobby.owner = client;
  // notify players in lobby of new owner
  for (i in lobby.players) {
    lobby.players[i].socket.emit("lobby", {'type': LOBBY_OWNER, 'id': lobby.owner.socket.id});
  }
}

function joinLobby(client, lobby) {
  if (lobby.state) return;
  // add client to lobby
  client.lobby = lobby;
  lobby.players.push(client);
  client.socket.emit("lobby", {'type': LOBBY_JOIN, 'id': lobby.id});
  // notify clients of new user
  for (i in lobby.players) {
    lobby.players[i].socket.emit("lobby", {'type': LOBBY_JOINED, 'id': client.socket.id, 'name': client.name});
    if (lobby.players[i] !== client) {
      client.socket.emit("lobby", {'type': LOBBY_JOINED, 'id': lobby.players[i].socket.id, 'name': lobby.players[i].name});
    }
  }
  // notify client of lobby owner
  client.socket.emit("lobby", {'type': LOBBY_OWNER, 'id': lobby.owner.socket.id});
}

function destroyLobby(lobby) {
  bc('lobby', { 'type': LOBBY_DESTROY, 'id': lobby.id});
  delete lobbies[lobby.id];
}

function leaveLobby(client) {
  if (!client.lobby) return;
  lobby = client.lobby;
  lobby.players.splice(lobby.players.indexOf(client), 1);
  if (lobby.players.length > 0) {
    // change owner if client was owner
    // notify players in lobby of player d/c
    for (i in lobby.players) {
      lobby.players[i].socket.emit("lobby", {'type': LOBBY_LEAVE, 'id': client.socket.id});
    }
    if (client == lobby.owner) {
      claimLobby(lobby.players[0], lobby);
    }
  } else {
    destroyLobby(lobby);
  }
  client.lobby = null;
}

module.exports = function (socket) {
  socket.emit('lobby', {'type': LOBBY_ID, 'id': socket.id});
  socket.emit('lobby', {'type': LOBBY_USERNAME, 'name': socket.client.conn.id});
  var client = {socket: socket, lobby: null, name: socket.client.conn.id};
  clients.push(client);

	socket.on("disconnect", function () {
    leaveLobby(client);
    clients.splice(clients.indexOf(client), 1);
	});

  socket.on("lobby", function(js) {
    switch (js['type']) {
      case LOBBY_CREATE:
        leaveLobby(client);
        createLobby(client, js['name']);
        break;
      case LOBBY_JOIN:
        leaveLobby(client);
        if (lobbies[js['id']]) joinLobby(client, lobbies[js['id']]);
        break;
      case LOBBY_LEAVE:
        leaveLobby(client);
        sendLobbies(client);
        break;
      case LOBBY_MSG:
        msgLobby(client, js['msg']);
        break;
      case LOBBY_UPDATE:
        break;
      case LOBBY_USERNAME:
        client.name = js['name'];
        break;
      case LOBBY_START:
        /*if (!client.lobby || client.lobby.state!=0) return;
        client.lobby.state = 1;*/
        console.log("LOBBY START FOR");
        console.log(client.lobby);
        if (!client.lobby) return;
        client.lobby.state = 1;
        for (i in client.lobby.players) {
          console.log('sending start to ' + i);
          client.lobby.players[i].socket.emit('lobby', {'type': LOBBY_START});
        }
        break;
      case LOBBY_STARTED:
        if (!client.lobby || client.lobby.state!=1) return;
        client.lobby.state = 2;
        for (i in client.lobby.players) {
          client.lobby.players[i].socket.emit('lobby', {'type': LOBBY_STARTED});
        }
        destroyLobby(client.lobby);
        break;
      case LOBBY_FINISHED:
        if (!client.lobby) return;
        client.lobby.state = 0;
        break;
    }
  });
  socket.on("rtc", function(data) {
    data = JSON.parse(data);
    console.log('rtc attempt');
    if (!client.lobby || client.lobby.state==0) return;
    console.log('sending rtc from ' + client.socket.id + ' to ' + data.to);
    console.log(data);
    for (i in client.lobby.players) {
      if (client.lobby.players[i].socket.id == data.to) client.lobby.players[i].socket.emit('rtc', JSON.stringify(data));
    }
  });
  sendLobbies(client);
};
