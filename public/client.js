(function () {
  var socket; //Socket.IO client

  navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
  window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
  window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
  window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

  function bind() {
    socket.on("add_lobby", function() {
    });
    socket.on("del_lobby", function() {
    });
    socket.on("connect", function () {
      console.log("connect");
      socket.emit("wat", "ok");
    });
    socket.on("disconnect", function () {
      console.log("disconnect");
    });
    socket.on("error", function () {
      console.log("error");
    });
    // WebRTC
    startRTC();
    startConnection(true);
  }
  /* ==== WebRTC ==== */
  var uuid = 0;
  var pc = null; // peer connection
  var dc = null; // data channel
  var pcc = {
    'iceServers': [
      {'urls': 'stun:stun.services.mozilla.com'},
      {'urls': 'stun:stun.l.google.com:19302'}
    ]
  };
  function startRTC() {
    uuid = getuuid();
    socket.on("rtc", handleMessage);
  }
  function startConnection(isCaller) {
    pc = new RTCPeerConnection(pcc);
    pc.onicecandidate = gotIceCandidate;
    dc = pc.createDataChannel("data");
    dc.onmessage = function(e) {
      console.log('data: ' + e.data);
    };
    dc.onopen = function() {
      console.log('dc open');
    };
    dc.onclose = function() {
      console.log('dc close');
    };
    //pc.onaddstream = gotRemoteStream;
    if (isCaller) {
      pc.createOffer().then(createdDescription).catch(errorHandler);
    }
  }
  function handleMessage(msg) {
    if (!pc) startConnection(false);
    var signal = JSON.parse(msg.data);
    if (signal.uuid == uuid) return false;

    if (signal.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function() {
        // Only create answers in response to offers
        if(signal.sdp.type == 'offer') {
          pc.createAnswer().then(createdDescription).catch(errorHandler);
        }
      }).catch(errorHandler);
    } else if (signal.ice) {
      pc.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(errorHandler);
    }
  }
  function createdDescription(desc) {
    console.log("got desc");
    console.dir(desc);
    pc.setLocalDescription(desc).then(function() {
      socket.emit('rtc', JSON.stringify({'sdp': pc.localDescription, 'uuid': uuid}));
    }).catch(errorHandler);
  }
  function errorHandler(err) {
    console.log(err);
  }
  function gotIceCandidate(evt) {
    if (evt.candidate != null) {
      socket.emit('rtc', JSON.stringify({'ice': evt.candidate, 'uuid': uuid}));
    }
  }
  function getuuid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }

  /**
   * Client module init
   */
  function init() {
    socket = io({ upgrade: false, transports: ["websocket"] });
    bind();
  }

  window.addEventListener("load", init, false);
})();
