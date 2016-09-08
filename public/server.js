module.exports = function (socket) {
  console.log(socket);
	socket.on("disconnect", function () {
		console.log("Disconnected: " + socket.id);
	});
  socket.on("rtc", function(data) {
    console.log('recv: '+data);
    socket.broadcast.emit(data);
  });

	console.log("Connected: " + socket.id);
};
