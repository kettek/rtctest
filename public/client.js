(function () {
  navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
  window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
  window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
  window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;
  /* ==== WebRTC ==== */
  var WebRTCConnection = function() {
    configuration = {
      "iceServers": [
        {'urls': 'stun:stun.services.mozilla.com'},
        {'urls': 'stun:stun.ekiga.net'},
        {'urls': 'stun:stun.l.google.com:19302'}
      ]
    };
    msg_count = 0;
    connections = [];
    is_server = false;
    signaler = null;
    // methods
    function start() {
      socket.on('rtc', handle);
    }
    function stop() {
      socket.removeEventListener('rtc', handle);
    }
    function openData(e) {
    }
    function closeData(e) {
        // TODO: reconnect? Remove player?
      console.log('peer data closed');
    }
    function handleData(e) {
      console.dir(e);
      console.log(e.data);
      logMsg('peer: ' + e.data);
      //queue.push(e.data);
    }
    function errorData(e) {
      console.log(e);
    }
    function setupData(dc) {
      dc.onclose = closeData;
      dc.onopen = openData;
      dc.onmessage = handleData;
      dc.onerror = errorData;
    }
    function connect(id, resolve, reject) {
      console.log(id+': connecting to');
      connections[id] = {name: id, pc: new RTCPeerConnection(configuration), dc: null};
      // send any ice candidates to the other peer
      connections[id].pc.onicecandidate = function (evt) {
        socket.emit('rtc', JSON.stringify({"candidate": evt.candidate, 'id': player_id, 'to': id}));
      };
      // let the "negotiationneeded" event trigger offer generation
      connections[id].pc.onnegotiationneeded = function () {
        console.log(id+': onnegotiationneeded');
        connections[id].pc.createOffer().then(function (offer) {
          console.log(id+': created offer and now setLocal');
          return connections[id].pc.setLocalDescription(offer);
        }).then(function () {
          console.log(id+': sent offer');
          // send the offer to the other peer
          socket.emit('rtc', JSON.stringify({"desc": connections[id].pc.localDescription, 'id': player_id, 'to': id}));
        }).catch(function(err) {
          console.log(err);
        });
      };

      if (is_server) {
        console.log(id+': creating datachannel');
        connections[id].dc = connections[id].pc.createDataChannel('data');
        connections[id].dc.onopen = function(e) {
          setupData(connections[id].dc);
          connections[id].dc.send('server says hi!');
          if (resolve) resolve();
        };
      } else {
        connections[id].pc.ondatachannel = function(e) {
          console.log(id+': attaching datachannel');
          connections[id].dc = e.channel;
          setupData(connections[id].dc);
          connections[id].dc.send('client says hi!');
          if (resolve) resolve();
        };
      }
    }

    function handle(msg) {
      msg = JSON.parse(msg);
      var id = msg['id'];
      if (id == player_id) return;
      if (!connections[id]) {
        connect(id);
      }
      var desc = msg['desc'];
      if (desc) {
        console.log(id+': got desc');
        desc = new RTCSessionDescription(desc);
        if (desc.type == 'offer') {
          console.log(id+': got offer from');
          connections[id].pc.setRemoteDescription(desc).then(function() {
            console.log(id+': set remotedesc, now createAnswer');
            return connections[id].pc.createAnswer();
          }).then(function(answer) {
            console.log(id+': created answer, setting local desc');
            return connections[id].pc.setLocalDescription(answer);
          }).then(function() {
            console.log(id+': sending our local desc');
            socket.emit('rtc', JSON.stringify({'desc': connections[id].pc.localDescription, 'id': player_id, 'to': id}));
          }).catch(function(err) {
            console.log(id+': '+err);
          });
        } else {
          console.log(id+': setting remote desc...? answer?');
          connections[id].pc.setRemoteDescription(desc).catch(function(err) {
            console.log(id+': '+err);
          });
        }
      } else if (msg['candidate']) {
        console.log(id+': got ice');
        connections[id].pc.addIceCandidate(new RTCIceCandidate(msg['candidate'])).catch(function(err) {
          console.log(id+': '+err);
        });
      }
    }
    // data handling
    return {
      listen: function() {
        is_server = false;
        start();
      },
      serve: function() {
        is_server = true;
        start();
      },
      connect: function(id, resolve, reject) {
        connect(id, resolve, reject);
      },
      close: function() {
        for (i in connections) {
          if (connections[i].dc) connections[i].dc.close();
          connections[i].pc.close();
        }
        connections = [];
      },
      send: function(i, data) {
        if (!connections[i]) return;
        connections[i].dc.send(data);
      },
      sendall: function(data) {
        for (i in connections) {
          connections[i].dc.send(data);
        }
      }
    }
  };

  var socket; //Socket.IO client
  var player_id = -1;
  var in_lobby = false;

  var lobby = { owner: -1, id: -1, name: 'none', players: {} }; // our joined lobby
  var conn = new WebRTCConnection();

  var lobbies = {};
  var eles = {};

  function addUi(parent, entry) {
    entry.T = entry.T || 'div';
    var e = document.createElement(entry.T);
    entry.w ? e.type=entry.w:0;
    entry.v ? e.value=entry.v:0;
    entry.t ? e.innerText=entry.t:0;
    entry.h ? e.style.display='none':0;
    e.id = entry.i || '';
    e.id ? eles[e.id] = e :0;
    for (evt in entry.e) {
      e.addEventListener(evt, entry.e[evt]);
    }
    for (c in entry.c) {
      addUi(e, entry.c[c]);
    }
    parent.appendChild(e);
  }
  function setupUi() {
    var view = {
      i: 'view',
      c: [
        {T: 'input', w: 'text', i: 'user', v: 'User'}
        , {T: 'button', i: 'update_name', t: 'Set Username', e: {
          'click': function() {
            socket.emit('lobby', {'type': LOBBY_USERNAME, 'name': eles['user'].value});
          }
        }}
        , {T:'br'}
        , {T: 'input', w: 'text', i: 'name', v: getuuid()}
        , {T: 'button', t: 'Create Lobby', i: 'create', e: {
          'click': function() {
            socket.emit('lobby', {'type': LOBBY_CREATE, 'name': eles['name'].value});
          }
        }}
        , {T: 'div', i: 'lobbies'}
      ] 
    };
    var room = {
      i: 'room',
      h: 1,
      c: [
        {T: 'h1', i: 'title', t: 'Room'}
        ,{T: 'button', i: 'leave', t: 'Leave', e: {
          'click': function() {
            leaveLobby();
            socket.emit('lobby', {'type': LOBBY_LEAVE});
            eles['room'].style.display = 'none';
            eles['view'].style.display = 'block';
          }
        }}
        , {T: 'input', w: 'text', i: 'chat'}
        , {T: 'button', t: 'Send', e: {
          'click': function() {
            socket.emit('lobby', {'type': LOBBY_MSG, 'msg': eles['chat'].value});
          }
        }}
        , {T: 'button', t: 'Start', e: {
          'click': function() {
            socket.emit('lobby', {'type': LOBBY_START});
          }
        }}
        , {T: 'div', i: 'players'}
        , {T: 'hr'}
        , {T: 'div', i: 'log'}
      ]
    };

    addUi(document.getElementById('view'), view);
    addUi(document.getElementById('view'), room);
  }

  function logMsg(msg) {
    var t = document.createElement('div');
    t.innerText = msg;
    eles['log'].appendChild(t);
  }

  function createLobby(id, name) {
    if (lobbies[id]) {
      lobbies[id].name = name;
    } else { 
      lobbies[id] = {id: id, name: name, element: document.createElement('div')};
    }
    lobbies[id].element.innerHTML = name;
    addUi(lobbies[id].element, {T:'button',t:'Join',e:{'click': function() {
      socket.emit('lobby', {'type': LOBBY_JOIN, 'id': id});
    }}});
    eles['lobbies'].appendChild(lobbies[id].element);
  }
  function destroyLobby(id) {
    if (!lobbies[id]) return;
    lobbies[id].element.parentElement.removeChild(lobbies[id].element);
    delete lobbies[id];
  }
  function removeLobbyPlayer(id) {
    lobby.players[id].element.parentElement.removeChild(lobby.players[id].element);
    logMsg(lobby.players[id].name+' has departed');
    delete lobby.players[id];
  }
  function leaveLobby() {
    if (lobby.id == -1) return;
    for (i in lobby.players) {
      removeLobbyPlayer(i);
    }
    lobby = {owner: -1, name: '', id: -1, players: {}};
    eles['log'].innerHTML='';
    eles['players'].innerHTML='';
  }

  function bind() {
    setupUi();
    socket.on("connect", function () {
    });
    socket.on("disconnect", function () {
      for (i in lobbies) {
        destroyLobby(lobbies[i].id);
      }
      leaveLobby();
    });
    socket.on("error", function () {
      // TODO: clear lobbies, disconnect from current
      alert('ERROR on socket');
    });
    // begin gross lobby handler
    socket.on("lobby", function(js) {
      switch(js['type']) {
        case LOBBY_USERNAME:
          console.log('got username');
          eles['user'].value = js.name;
          break;
        case LOBBY_ID:
          console.log('got id');
          player_id = js.id;
          break;
        case LOBBY_CREATE:
          createLobby(js.id, js.name);
          break;
        case LOBBY_DESTROY:
          destroyLobby(js.id);
          break;
        case LOBBY_JOINED:
          lobby.players[js.id] = { name: js.name, element: document.createElement('div') };
          lobby.players[js.id].element.innerText = lobby.players[js.id].name;
          eles['players'].appendChild(lobby.players[js.id].element);
          logMsg(lobby.players[js.id].name+' has joined');
          break;
        case LOBBY_LEAVE:
          removeLobbyPlayer(js.id);
          break;
        case LOBBY_JOIN:
          lobby.name = lobbies[js.id].name;
          lobby.id = js.id;
          for (i in lobbies) {
            destroyLobby(i);
          }
          eles['title'].innerText = lobby.name;
          eles['view'].style.display = 'none';
          eles['room'].style.display = 'block';
          break;
        case LOBBY_UPDATE:
          break;
        case LOBBY_OWNER:
          lobby.owner = js.id;
          logMsg(lobby.players[js.id].name+' has been crowned');
          break;
        case LOBBY_MSG:
          logMsg(lobby.players[js.id].name+': '+js.msg);
          break;
        case LOBBY_START:
          console.log('received START');
          if (lobby.owner == player_id) {
            console.log('serving');
            conn.serve();
            var p = [];
            for (i in lobby.players) {
              if (i == player_id) continue;
              p.push(new Promise(function(resolve, reject){
                console.log('connecting to ' + i + ' and passing resolve');
                conn.connect(i, resolve, reject);
              }));
            }
            Promise.all(p).then(function() {
              console.log('connected to all clients');
              socket.emit('lobby', {'type': LOBBY_STARTED});
            }).catch(function(err) {
              console.log('failed to connect to all clients:' + err);
            });
            //for (i in lobby.players) conn.connect(i);
          } else {
            console.log('listening');
            conn.listen();
          }
          break;
      }
    });
  }
  function getuuid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4()+s4();
  }
  function init() {
    socket = io({ upgrade: false, transports: ["websocket"] });
    bind();
  }
  window.addEventListener("load", init, false);
})();
