/*
	Websockets gateway
*/

/* global require, module, exports, console, setTimeout */

var sockjs = require("sockjs"),core,
	cookie = require("cookie"),
	log = require("../lib/logger.js"),
	config = require("../config.js"),
	EventEmitter = require("events").EventEmitter,
	session = require("./session.js"),
	guid = require("../lib/guid.js"),
	crypto = require("crypto"),
	names = require("../lib/names.js");


var rConns = {}, users = {};
var pid = guid(8);
var sock = sockjs.createServer();

sock.on('connection', function (socket) {
	var conn = { socket: socket };
	
	socket.on('data', function(d) {
		try { d = JSON.parse(d); log ("Socket received ", d); }
		catch(e) { log("ERROR: Non-JSON data", d); return; }
		
		
		switch(d.type) {
			case 'init': init(d.data, conn); break;
			case 'message': message(d.data, conn); break;
			case 'messages': messages(d.data, conn); break;
			case 'room': room(d.data, conn); break;
			case 'rooms': rooms(d.data, conn); break;
		}
	});
	
	conn.send = function(type, data) {
		socket.write(JSON.stringify({type: type, data: data}));
	};
	socket.on('close', function() { close(conn); });
});

exports.init = function(server, coreObject) {
    core = coreObject;
    sock.installHandlers(server, {prefix: '/socket'});
};

function init(data, conn) {
	var user, sid = data.sid, nick = data.nick, i;
	
	session.get({ sid:sid, suggestedNick:data.nick }, function(err, sess) {
		var rooms = sess.user.rooms;
		var i;
		console.log("RETRIEVED SESSION", sess);
		conn.sid = sid;
		conn.rooms = [];

		if (sess.user.id.indexOf("guest-")===0 && data.nick)	sess.user.id="guest-"+data.nick;
		if(sess.pid !== pid) {
			sess.pid = pid;
			for(i in rooms) {
				if(rooms.hasOwnProperty(i)) rooms[i] = 0;
			}
		}
		log("-------nick----------",sess.user);
		var query=[];
		if (sess.user.id.indexOf('guest-')!==0) {
			query.user=sess.user.id;
		}
		core.emit("members", query,function(err,d) {
			var m={};
			if (d) {
				for (i=0;i<d.length;i++) {
					log("adding room-------",d[i].room);
					m[d[i].room]=true;
				}
			}
			sess.user.membership = Object.keys(m);//Room added to user object
			
			conn.send('init', {
				sid: sess.cookie.value,
				user: sess.user,
				clientTime: data.clientTime,
				serverTime: new Date().getTime(),
				
			});
			session.set(conn.sid, sess);
		});
	});
}

function close(conn) {
	if(!conn.sid) return;

	session.get({sid: conn.sid}, function(err, sess) {
		if(err) {
			log("Couldn't find session to close.");
			return;
		}
		var user = sess.user;
		
		conn.rooms.forEach(function(room) {
			log("Closed connection, removing", user.id, room);
			userAway(user, room, conn);
		});
		session.set(conn.sid, sess);
	});
}

function userAway(user, room, conn) {
	if(rConns[room]) rConns[room].splice(rConns[room].indexOf(conn), 1);
	conn.rooms.splice(conn.rooms.indexOf(room), 1);
	setTimeout(function() {
		session.get({sid: conn.sid}, function(err, sess) {
			var user = sess.user;
			if (typeof user.rooms[room] !== "undefined" && user.rooms[room]<=1) {
				delete user.rooms[room];
				core.emit("message", { type: 'away', from: user.id, to: room,
					time: new Date().getTime(), origin : {gateway : "web", location : "", ip :  conn.socket.remoteAddress}}, function(err, m) {
						log(err, m);
					});
				if(!Object.keys(user.rooms).length) {
					delete users[user.id];
				}
				console.log("saving the session ",user);
			}
			else {
				user.rooms[room]--;
				log("User still has some active windows or away already sent.",user);
			}
			session.set(conn.sid, sess);
		});
	}, 30*1000);
	return false; // never send an away message immediately. Wait.
}

function userBack(user, room, conn) {
	if(rConns[room]) rConns[room].push(conn);
	else rConns[room] = [conn];
	conn.rooms.push(room);
	
	users[user.id] = user;

	if(typeof user.rooms[room] !== "undefined" && user.rooms[room]>0) {
		user.rooms[room]++;
		return false; // we've already sent a back message for this user for this room.
	}
	console.log("Should send back msg");
	user.rooms[room] = 1;
	return true;
}

function messages (query, conn) {
	core.emit("messages", query, function(err, m) {
		if(err) {
			log("MESSAGES error", query, err);
			conn.send('error', err);
			return;
		}
		conn.send('messages', { query: query, messages: m} );
	});
}

function message (m, conn) {
	
	if(!conn.sid) return;
	console.log(conn.sid);
	session.get({sid: conn.sid}, function(err, sess) {
		var user = sess.user, tryingNick, roomName;
		console.log(sess.sid);
		roomName = m.to;
		
		m.from = user.id;
		m.time = new Date().getTime();

		if (m.origin) m.origin.ip = conn.socket.remoteAddress;
		else{
			m.origin = {gateway: "web", ip: conn.socket.remoteAddress, location:"unknown"};
		}
		if(!m.to && Object.keys(user.rooms).length !== 0) {
			m.to = m.to || Object.keys(user.rooms);
		}

		if(m.to && typeof m.to != "string" && m.to.length===0) return;

		if(m.type == 'join'){
			//check for user login as well
			sess.user.membership.push(roomName);
			session.set(conn.sid, sess);
		}
		if(m.type == 'part'){
			//check for user login as well
			sess.user.membership.splice(sess.user.membership.indexOf(roomName),1);
			session.set(conn.sid, sess);
		}
		
		if (m.type == 'back') {
			if(!userBack(user, m.to, conn)) {
				session.set(conn.sid, sess);
				return; 
			}
			session.set(conn.sid, sess);
			// it returns false if the back message for this user is already sent
		} else if (m.type == 'away') {
			if(!userAway(user, m.to, conn)) {
				session.set(conn.sid, sess);
				return; 
			}
			// it returns false if the away message for this user is not to be sent yet
		} else if(m.type == 'nick') {
			//validating nick name on server side 
			console.log("checking for nick validity:" , m.ref);
			if(m.ref && m.ref !== "guest-" && !validateNick(m.ref.substring(6))) {
				return conn.send('error', {id:m.id , message: "INVALID_NAME"});
			}
			if(m.ref && users[m.ref] )
				return conn.send('error', {id: m.id, message: "DUP_NICK"});
			if(m.user){
				if(!m.user.id) return conn.send("error", {id: m.id, message: "INVALID_NAME"} );
				m.user.originalId = user.id;
				if (!m.user.originalId.match(/^guest/)) {
					log("user cannot change the nick.");
					return;
				}
				if(!m.user.accounts){m.user.accounts=[];}
				m.user.accounts[0] = user.accounts[0];
			}
		}
		
		function sendMessage() {
			core.emit("message", m, function (err, m) {
				var i, user = sess.user;
				if(err && err.message == "GUEST_CANNOT_HAVE_MEMBERSHIP"){
					return conn.send('error', {id: m.id, message: err.message});
				}
				//for audience mismatch error.
				if(err && err.message && err.message.indexOf("AUTH_FAIL")>0) {
					return conn.send('error', {id: m.id, message: err.message});
				}
				if (!user || !user.id) {
					console.log("No session user?");
					return;
				}
				
				if(m && m.type && m.type == 'nick') {

					//in case of logout.
					if(/^guest-/.test(m.ref) && !/^guest-/.test(m.from)){
						sess.user.id = m.ref;
						sess.user.picture = "//s.gravatar.com/avatar/" + crypto.createHash('md5').update(sess.user.id).digest('hex') + "/?d=identicon&s=48";
						sess.user.accounts = [];
						sess.user.membership = [];
						session.set(conn.sid, sess);
						conn.send('init', {
							sid: sess.cookie.value,
							user: sess.user
						});
						return;
					}

					if(m.user) {
						console.log("m.user is", m.user);
						/*	why shallow copy? why not sess.user = m.user?
							copying the property like accounts to the session, but the user will not send other properties.
						*/
						for(i in m.user) if(m.user.hasOwnProperty(i)) {
							user[i] = m.user[i];
						}
					} else if(!err){
						user.id = m.ref;
					}
					console.log("Saved session", sess);
					session.set(conn.sid, sess);
					var query=[];
					if (sess.user.id.indexOf('guest-')!==0) {
						query.user=sess.user.id;
					}
					core.emit("members", query,function(err,d){
						var m={};
						if (d) {
							for (i=0;i<d.length;i++) {
								m[d[i].room]=true;
							}
						}
						sess.user.membership = Object.keys(m);
						if(!err){
							conn.send('init', {
								sid: sess.cookie.value,
								user: sess.user
							});
						}
						session.set(conn.sid, sess);
					});
					if(m.ref) {
						users[m.ref] = users[user.from] || {};
						if(users[m.from]) delete users[m.from];
						if(m.ref.indexOf("guest-") !== 0) {
							users["guest-"+m.from]=users[user.from];
						}
					}
				}

				/* 
					Why this is not at the top?
					this thing should be at the bottom because we need the error AUTH_UNREGISTERED to be handled properly before sending the response.
				 */
				if (err) {
					return conn.send('error', {id: m.id, message: err.message});
				}
			});
		}
		
		if(m.type=="nick" && m.ref!="guest-" &&( m.ref || m.user)) {
			tryingNick = m.ref || m.user.id;
			core.emit("rooms",{id:tryingNick.replace(/^guest-/,"")},function(err,data){
				console.log(err);
				if(err) return conn.send('error', {id: m.id, message: err.message});
				console.log("Result of core on dup check",data);
				if((data.length>0) || data.id) return conn.send('error', {id: m.id, message: "DUP_NICK"});
				sendMessage();
			});
		} else {
			sendMessage();
		}
	});
}


function room (r, conn) {
	var user;
	session.get({sid: conn.sid}, function(err, sess) {
		if(!conn.sid) return;
		if(typeof r === 'object') {
			user = sess.user;
			r.owner = user.id;
		}
		core.emit("room", r, function(err, data) {
			if(err) {
				log("ROOM ERROR", r, err);
				data = {error:err.message};
				data.query= {
					queryId : r.queryId
				};
				conn.send('error', data);
			}else{
				data.query= {
					queryId : r.queryId
				};
				conn.send('room', data);
			}
		});
		session.set(conn.sid, sess);
	});
}

function rooms(query, conn) {
	console.log(query);
	core.emit("rooms", query, function(err, data) {
		if(err) {
			log("ROOMS ERROR", query, err);
			query.err = err;
			conn.send('error',query);
			return;
		}else {
			log(data);
			conn.send('rooms', { query: query, data: data} );
			//conn.send('rooms', data);	
		}
	});
}

function validateNick(nick){
	if (nick.indexOf("guest-")===0) return false;
	return (nick.match(/^[a-z][a-z0-9\_\-\(\)]{2,32}$/i)?nick!='img'&&nick!='css'&&nick!='sdk':false);
}

// ----- Outgoing send ----

exports.send = function (message, rooms) {
	message.text = message.text || "";
	log("Socket sending", message, "to", rooms);
	
	rooms.map(function(room) {
		var location, to = message.to;
		if(message.origin) {
			location= message.origin;
			delete message.origin;
		}
		//if(message.type == "text") core.occupants(message.to, function(err, data){console.log(err, data);});
		if(rConns[room]) rConns[room].map(function(conn) {
			message.to = room;
			conn.send('message', message);
		});
		if(location) message.origin = location;
		message.to = to;
	});
};
