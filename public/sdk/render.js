"use strict";

Stream.prototype.scroll = function() {
	var log = this.log, msg = log.firstChild, i=0, pos,
		start = 99999, end = 0, up, self = this, cb,
		viewTop = offset(log)[1] + log.scrollTop,
		viewBottom = viewTop + log.clientHeight;
	
	
	// Ignore "scroll" events caused by DOM mutation (from a previous scroll event.)
	if (this.updating) {
		return;
	}
	
	// Find the indexes of the first and last message that are visible.
	while(msg) {
		pos = offset(msg)[1];
		if(pos >= viewTop && pos <= viewBottom){
			if(i < start) start = i;
			if(i > end) end = i;
		}
		msg = msg.nextSibling;
		i++;
	}
	
	if (typeof this.lastScrollTop === 'undefined') {
		this.lastScrollTop = log.scrollTop;
		return;
	}

	up = log.scrollTop < this.lastScrollTop;
	
	// Remember the current scroll position, ID of the first message shown, etc.
	// This is because the scrollbar gets reset when messages shown are changed.
	// We will have to manually scroll to where it was, and remembering these things
	// will help.
	this.lastScrollTop = log.scrollTop;
	this.scrollId = this.messages[start].id;
	this.scrollPx = offset(this.log.children[start])[1] - offset(this.log)[1] -  this.log.scrollTop;
	
	// The requested flags prevents you from making duplicate requests.
	// These cancel the requested flag put earlier when:
	// the user starts scrolling in the other direction, etc.
	this.requested[up?"dn":"up"] = false;
	if (start >= 10) self.requested.up = false;
	if (self.messages.length - end >= 10) self.requested.dn = false;
	
	this.renderThumb(start, end);
	
	// Checks if it is at the bottom or not.
	// TODO: This sucks, the last message in self.messages might not be the most recent one.
	if (end >= self.messages.length - 1 && !up) {
		scrollback.debug && console.log("bottomed out");
		this.bottom = true;
	} else {
		this.bottom = false;
	}
	
	cb = function(m) { self.update(m); };
	
	if (this.bottom) {
		core.watch(self.id, null, 3*(end-start) + 10, 0, cb);
	} else {
		core.unwatch(self.id);
		if (!this.requested[up?"up":"dn"] && (up && start < 10 || !up && self.messages.length - end < 10)) {
			this.requested[up?"up":"dn"] = true;
			core.watch(self.id, self.messages[start].time, (end-start)+10, 2*(end-start)+10, cb);
		}
	}
	
};

Stream.prototype.update = function (data) {
	var self = this, top, i, l;
	this.messages = data;
	this.updating = true;
	this.renderLog();
	this.renderTimeline();
	
	if (this.bottom) {
		this.log.scrollTop = this.log.scrollHeight;
	} else {
		for(i=0, l=this.messages.length; i<l; i++) {
			if (this.messages[i].id ==  self.scrollId) break;
		}
		this.log.scrollTop = offset(this.log.children[i])[1] - offset(this.log)[1] - this.scrollPx;
	}
	this.lastScrollTop = this.log.scrollTop;
	setTimeout(function() {
		self.updating = false;
	}, 100);
};

Stream.prototype.renderLog = function() {
	var lastMsg, self = this, el;
	
	if (this.hidden) return;
	
	this.log.innerHTML = '';
	
	this.messages.forEach(function(message) {
		if (lastMsg) {
			el = self.renderMessage(lastMsg, message.time - lastMsg.time > 60000);
			if(el) self.log.appendChild(el);
		}
		lastMsg = message;
	});
	if(lastMsg) self.log.appendChild(self.renderMessage(lastMsg, true));
};

Stream.prototype.renderThumb = function(start, end) {
	var cacheMessages = core.cache(this.id);
	var log = this.log, x,y,
		thumbStart=this.messages[start].time,
		thumbEnd=this.messages[end].time,
		cStart = cacheMessages[0].time,
		duration = cacheMessages[cacheMessages.length-1].time - cStart;

	if (this.hidden) return;

	x = Math.round((thumbStart-cStart)*this.tread.clientHeight/duration);
	y = Math.round((thumbEnd-thumbStart)*this.tread.clientHeight/duration);

	this.thumb.style.top = x + 'px';
	this.thumb.style.height = Math.max(2, y) + 'px';
};

Stream.prototype.renderTimeline = function() {
	if (this.hidden) return;
        
	var buckets = [], h=4, n = Math.floor(this.tread.clientHeight/h),
		i, k = 0, length, w = 18,
		msg, first, duration, r, ml = ["div"], max=0;
        
    var cacheMessages = core.cache(this.id);

	this.tread.innerHTML = '';
        

	if (!cacheMessages.length) {
		return;
	}
	
	msg = cacheMessages[0];
	length=cacheMessages.length;
	first = msg.time || 0;

	duration = cacheMessages[length-1].time - first;
	
	
	for (k = 0; k<length; k++) {
		
		msg=cacheMessages[k];
		if (msg.type!=="text") {
			continue;
		}
		
		i = Math.floor((msg.time-first)*n / duration);
		if(!buckets[i]) buckets[i] = {
			nicks: {},
			n: 0,
			dominant:{
				nick:msg.from, count:1
			}
		};

		buckets[i].nicks[msg.from] = (buckets[i].nicks[msg.from] || 0) + (msg.text || "").length;

		if (buckets[i].dominant.count<=buckets[i].nicks[msg.from]) {
			buckets[i].dominant={nick:msg.from,count:buckets[i].nicks[msg.from]};
		}

		buckets[i].n += msg.text.length;
		if(buckets[i].n > max) max = buckets[i].n;

	}

	for(i=0; i<n; i+=1) {
		if(buckets[i]) {
			r = ["div", {
				'class': 'scrollback-tread-row scrollback-user-' +
					Object.keys(buckets[i].nicks).join(' scrollback-user-'),
				style: {
					top: Math.round(i*h) + 'px',
					width: Math.round(h+buckets[i].n*(w-h)/max) + 'px',
					background:hashColor(buckets[i].dominant.nick)
				}
			}];
			ml.push(r);
		}
	}
	
	this.tread.appendChild(JsonML.parse(ml));
};

// --- color for names ---

function hashColor(name) {
	if (!name) return '#999';
	name = name.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/^\s+/g,'').replace(/\s+$/g,''); 
	// nicks that differ only by case or punctuation should get the same color.
	
	function hash(s) {
		
		var h=7, i, l;
		s = s.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/^\s+/g,'').replace(/\s+$/g,''); 
		// nicks that differ only by case or punctuation should get the same color.
		for (i=0, l=s.length; i<l; i++) {
			h = (h*31+s.charCodeAt(i)*479)%1531;
		}
		return h%1530;
	}
	
	function color(h) {
		// h must be between [0, 1529] inclusive
		
		function hex(n) {
			var h = n.toString(16);
			h = h.length==1? "0"+h: h;
			return h;
		}
		
		function rgb(r, g, b) {
			return "#" + hex(r) + hex(g) + hex(b);
		}
		
		if(h<255) return rgb(255, h, 0);
		else if(h<510) return rgb(255-(h-255), 255, 0);
		else if(h<765) return rgb(0, 255, h-510);
		else if(h<1020) return rgb(0, 255-(h-765), 255);
		else if(h<1275) return rgb(h-1020, 0, 255);
		else return rgb(255, 0, 255-(h-1275));
	}
	
	return color(hash(name));
}

Stream.prototype.renderMessage = function (message, showTimestamp) {
	var el, self = this;

	var mentionedRegex = new RegExp("\\b"+core.nick().replace(/^guest-/,"")+"\\b");
	var mentionedClass = mentionedRegex.test(message.text)&& message.from != core.nick()?" scrollback-message-mentioned ":"";
	function format(text) {
		if(!text) return "";
		var u = /\b(https?\:\/\/)?([\w.\-]*@)?((?:[a-z0-9\-]+)(?:\.[a-z0-9\-]+)*(?:\.[a-z]{2,4}))((?:\/|\?)\S*)?\b/g;
		var m = ["span"], r, s=0, protocol, user, domain, path;
		while((r = u.exec(text)) !== null) {
			m.push(text.substring(s, r.index));
			protocol = r[1], user = r[2], domain = r[3], path = r[4] || '';
			
			protocol = protocol || (user? 'mailto:': 'http://');
			user = user || '';
			
		//	console.log(s);
			s = u.lastIndex;
			m.push(["a", {href: protocol + user + domain + path, target: '_blank'}, r[0]]);
		}
		m.push(text.substring(s));
		return m;
	}
	
	function formatName(name) {
		if(!name) return "";
		return [ "span", {
			'class': 'scrollback-message-nick',
			onmouseout: function() {
				if(self.userStyle) self.userStyle.parentNode.removeChild(self.userStyle);
			},
			onmouseover: function() {
				var ucss = {".scrollback-tread-row": {width: "0 !important"}};
				ucss[ ".scrollback-user-" + name] = {
					"background": hashColor(message.from) + " !important",
					width: "100% !important"
				};
				self.userStyle = addStyles(ucss);
			}
		},  (name.indexOf("guest-")===0)?(name.replace("guest-","")):name];
	}
	
	switch(message.type) {
		case 'text':
			el = [
				[ "span", { 'class': 'scrollback-message-separator'}, '['],
				formatName(message.from)];
			if(message.text.indexOf('/me ') === 0) {
				el.push([ "span", format(message.text.substr(3)) ]);
				el.push([ "span", { 'class': 'scrollback-message-separator'}, '] ']);
			} else {
				el.push([ "span", { 'class': 'scrollback-message-separator'}, '] ']);
				el.push([ "span", { 'class': 'scrollback-message-content'}, format(message.text) ]);
			}
			break;
		case 'back':
			el = [["span", formatName(message.from), ' entered.']];
			break;
		case 'away':
			el = ["span", formatName(message.from), ' left'];
			if (message.text) el.push(' (', format(message.text), ')');
			else el.push('.');
			el = [el];
			break;
		case 'nick':
			el = [["span", formatName(message.from), ' is now known as ', formatName(message.ref)]];
			break;
		default:
			el = [["span", message.text]];
	}
	
	if (showTimestamp && message.time) {
		el.push([ "span", { 'class': 'scrollback-message-timestamp'},
			"Sent " + prettyDate(message.time, core.time())
		]);
	}
	
	if(!el) return null;
	console.log();
	el = JsonML.parse(["div", {
		'class': 'scrollback-message scrollback-message-' + message.type+mentionedClass,
		'style': { 'borderLeftColor': hashColor(message.from/*message.from*/) },
		'data-time': message.time, 'data-from': formatName(message.from)
	}].concat(el));
	
	return el;
};
