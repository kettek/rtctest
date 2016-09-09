var TYPE_RTC = 0;
var TYPE_LOBBY = 1;
var LOBBY_CREATE = 0;   // client: {name},      server: {lobby.id, lobby.name}
var LOBBY_DESTROY = 1;  //                      server: {lobby.id}
var LOBBY_JOIN = 2;     // client: {lobby.id},  server: {lobby.id}
var LOBBY_JOINED = 3;   //                      server: {client.id, client.name}
var LOBBY_LEAVE = 5;    // client: {},          server: {client.id}
var LOBBY_OWNER = 6;    //                      server: {client.id}
var LOBBY_UPDATE = 7;
var LOBBY_MSG = 8;      // client: {msg},       server: {client.id, msg}
var LOBBY_USERNAME = 9;
var LOBBY_ID = 10;
var LOBBY_START = 11;
var LOBBY_STARTED = 12;
var LOBBY_FINISHED = 13;

