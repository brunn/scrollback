"use strict";
var config = require("../config.js");
var crypto = require('crypto');

var express = require("express"),
	RedisStore = require('connect-redis')(express),
	store =new RedisStore({
	    host: config.redis.host,
	    port: config.redis.port,
	    db: config.redis.db
	}),
	signature = require("express/node_modules/cookie-signature"),
	cookie = require("cookie"),
	guid = require("../lib/guid.js"),
	names = require("../lib/names.js"),
	_get = store.get,
	key = "scrollback_sessid",
	secret = "ertyuidfghjcrtyujwsvokmdf",
	watchers = {};
	
function initUser() {
	var guestname = 'guest-sb-' + names(6);
	var guestpic = 'https://gravatar.com/avatar/' + crypto.createHash('md5').update(guestname).digest('hex') + '/?d=identicon&s=48';
	return {
		id: guestname,
		picture: guestpic,
		accounts: [],
		rooms: {}
	};
}

exports.get = function(user, cb) {
	unsign(user.sid, function(id, session) {
		store.set(id, session);
		cb(null, session);
	});
};
var set = exports.set = function(sid, sess, cb) {
	var i;
	unsign(sid, function(id) {
		store.set(id, sess);
	});
};

var exparse = express.session({
	secret: secret,
	key: key,
	store: store,
	cookie: { domain: config.http.cookieDomain, httpOnly : false }
});

exports.store = store;

var parse = exports.parser = function(req, res, next) {
	exparse(req, res, function() {
		if(!req.session.user) {
			req.session.user = initUser();
			req.session.cookie.value = 's:' + signature.sign(req.sessionID, secret);
			store.set(req.sessionID, req.session);
		}
		next();
	});
};

function unsign(sid, cb) {
	var noop = function(){},
		fakeReq = {cookies: {}, signedCookies: {}, originalUrl: '/', on: noop, removeListener: noop},
		fakeRes = { on: noop };
	fakeReq.cookies[key] = sid;
	
	parse(fakeReq, fakeRes, function() {
		cb(fakeReq.sessionID, fakeReq.session);
	});
}

