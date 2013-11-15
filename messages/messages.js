"use strict";

var db = require("../lib/mysql.js");
var log = require("../lib/logger.js");

module.exports = function(core){
	core.on("messages", function(options, callback) {
		var startTime = new Date().getTime();
		
		var dbName = "_messages";

		if (options.type) dbName = options.type + dbName;

		var query = "SELECT * FROM `" + dbName + "` ",
			where = [], params=[], desc=false, limit=256, until, since, originObject = {};
		
		until=options.until;
		since=options.since;
		
		if (!until && !since) {
			until = new Date().getTime();
		}
		
		if(until) {
			where.push("`time` < ?");
			params.push(until);
		}
		
		if(since) {
			where.push("`time` > ?");
			params.push(since);
		}
		
		if(options.to) {
			where.push("`to` in (?)");
			if(typeof options.to=="string")
				params.push([options.to]);
			else
				params.push(options.to);
		}
		
		if(options.from) {
			where.push("`from` in (?)");
			if(typeof options.from=="string")
				params.push([options.from]);
			else
				params.push(options.from);
		}

		// if(options.type) {
		// 	where.push("`type` = ?");
		// 	params.push(options.type);
		// }
		
		if(until) {
			desc = true;
		}

		if(options.type == "text" && options.labels) {
			where.push("`label` in (?)");
			params.push(options.labels);
		}

		
		if(where.length) query += " WHERE " + where.join(" AND ");
		query += " ORDER BY `time` " + (desc? "DESC": "ASC");


		//this is a hacky fix... should be changed... this need to get all the messages in db for rooms.
		// limit: 0 will give all the messages. limit : something or limit undefined will give at max 256 msgs.
		if(typeof options.limit == "undefined")
			options.limit =255;
		if(options.limit && options.limit<=256){
			limit = options.limit;
		}

		if(limit) query += " LIMIT " + (limit + 1);
		
		if(desc) query = "SELECT * FROM (" + query + ") r ORDER BY `time` ASC";
		
		log(query, params);
		db.query(query, params, function(err, data) {
			var start, end;

			if(err && callback) return callback(err);
			data.forEach(function(element){
				element.type = options.type;
				element.labels = [element.labels];
				try{
					element.origin = JSON.parse(element.origin);
				}
				catch(Exception){
					originObject = {};
					originObject.gateway = element.origin.split(":")[0];
					if (originObject.gateway == "irc")
						originObject.channel = element.to;
					if (originObject.gateway == "web") {
						originObject.ip = element.origin.split("//")[1];
					}
					element.origin = originObject;
				}
				if (element.origin && element.origin.gateway == "web") delete element.origin.location;
			});
			start  = since || data.length && data[0].time || 0;
			end = until || data.length && data[data.length-1].time || 0;

			if (desc) {
				data.push({type: 'result-end', to: options.to, time: end });
			} else {
				data.unshift({type: 'result-start', to: options.to, time: start });
			}
			
			if (limit && data.length > limit) {
				if (desc) {
					data = data.slice(1);
					data.unshift({type: 'result-start', to: options.to, time: start });
				} else {
					data = data.slice(0,limit);
					data.push({type: 'result-end', to: options.to, time: end });
				}
			}
			
			log(data.length, "results in", new Date().getTime() - startTime, "ms");
			if(callback) callback(true, data);
		});
	}, "storage");
};

