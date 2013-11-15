"use strict";

var config = require('../config.js');
var db = require('../lib/mysql.js'),
guid = require('../lib/guid.js');
var log = require("../lib/logger.js");
var dbName;

module.exports = function(core) {
	core.on("message", function(message, callback) {
		if (!message.id) message.id = guid();
		if (!message.time) message.time = new Date().getTime();
		log("Heard \"message\" event");
		if(typeof message.to === 'string') message.to = [message.to];

		if(typeof message.labels === 'string') message.labels = [message.labels];
		else if(!message.labels || message.labels.length == 0) message.labels = [ "" ];

		if(message.type) dbName = message.type + "_messages"  ;

		// TODO: Rewrite this to use a single INSERT query.db.
		message.to.forEach(function(to) {
			if(message.type == "text"){
				db.query("INSERT INTO `" + dbName + "` SET `id`=?, `from`=?, `to`=?, `text`=?, "+
				"`origin`=?, `time`=?, `labels`= ?", [message.id, message.from, message.to, 
				message.text,  JSON.stringify(message.origin), message.time, message.labels[0]]);
			}
			if( message.type == "nick"){
				db.query("INSERT INTO `" + dbName + "` SET `id`=?, `from`=?, `to`=?, "+
				"`origin`=?, `time`=?, `ref`=?", [message.id, message.from, message.to, 
				JSON.stringify(message.origin), message.time, message.ref]);
			}
			if ( message.type == "away" || message.type == "back" || message.type == "join" || message.type == "part"){
				db.query("INSERT INTO `" + dbName + "` SET `id`=?, `from`=?, `to`=?, "+
				"`origin`=?, `time`=?", [message.id, message.from, message.to, 
				JSON.stringify(message.origin), message.time]);
			}
		});
		return callback? callback(null, message): null;
	}, "storage");
};
