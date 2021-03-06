var config = require('../config.js'), core,
log = require("../lib/logger.js"),
fs = require("fs"),core,
code = fs.readFileSync(__dirname + "/../public/client.min.js",'utf8');
var validateRoom = require('../lib/validate.js');
var crypto = require('crypto');
var db = require("../lib/mysql.js");
var httpConfigResponseObject;
var scriptResponseObject;



exports.init = function(app, coreObject) { 
	core = coreObject;
    var dialogs = {
        "login" : function(req, res){
            res.render("login", {
                user: req.session.user, 
                requireAuth: req.query.requireAuth
            });
        },
        "profile" : function(req, res){
            res.render("profile", {user: req.session.user});
        },
		"cookie": function(req, res) {
			res.end(req.query.callback+"('"+req.cookies["scrollback_sessid"]+"')");
		},
		"debug": function(req, res) {
			res.end(req.cookies["scrollback_sessid"] + '\r\n' + JSON.stringify(require("./session.js").store));
		}
    };
    //handling it for now but should probably think a way to make newProfile the static file.
    app.get("/s/me/edit", function(req, res) {
        var user = req.session.user;
        if(/"guest-"/.test(user.id)) {
            if(!user.accounts || user.accounts.length ==0) {
                return res.render("newProfile",{email:user.accounts[0].id.split(":")[1]});        
            }else {
                return res.redirect(307, '//'+config.http.host+"/s/login.html"+queryString);
            }
        }else{
            return res.render("newProfile",{email:user.accounts[0].id.split(":")[1]});
        }
    });
	function loginHandler(req, res) {
        var user = req.session.user, responseObject={};
        responseObject.user = req.session.user;
		responseObject.defaultTitle = "Your rooms";
		responseObject.room = {title: "", id: ""};
		res.render("d/main" , responseObject);
    }
    app.get("/me", loginHandler);
	app.get("/me/login", loginHandler);
    app.get("/dlg/*",function(req,res){
        var dialog=req.path.substring(1).split("/")[1];
        if(dialogs[dialog]) {
            dialogs[dialog](req,res);
        }
        else{
            res.render("error",{error: "dialog missing"});
        }
    });

    app.get("/pwn/*",function(req,res){
        var room = req.path.substring(1).split("/")[1];
        var url=req.path.replace("/pwn/"+room+"/","");
        if(url.indexOf("http://")<0){
            url="http://"+url;
        }
        res.render("pwn",{
            room:room,
            url:url
        });
    });

    app.get('/t/*', function(req, res, next) {
        var streams = req.path.substring(3);

        streams = streams.split("/+/").map(function(p) {
            return p.split('/')[0];
        });

        res.render("room", {
            streams: JSON.stringify(streams),
            title: streams.join(', ').replace(/\b[a-z]/g, function(m) {
                return m.toUpperCase();
            })
        });
    });
	
	app.get("/dummy/:page", function (req, res) {
		res.render("dummy/" + req.params.page, { room: { 
            id: "roomId", name: "Sample Room 1", 
            description: "This is a sample room and this is a description for the sample room, this description should be a little larger I presume. Here is the Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis semper lobortis leo accumsan adipiscing. Curabitur eu leo id elit aliquet sagittis ut eu leo. Nulla facilisi. .", picture: "",
            profile: "http://sampleroom.blogspot.com" 
        }});
	});   
	
	app.get("/beta/*", function(req, res){
		return res.redirect(307, 'https://'+config.http.host+ req.path.substring(5));
	});
	
    function roomHandler(req, res, next) {
        var params = req.path.substring(1).split("/"), responseObj={}, 
        query={}, sqlQuery, roomId = params[0], user = req.session.user,
        queryString, resp={};
        if(roomId=="old") return next();
        if(roomId && !validateRoom(roomId)) return next();
        
		if(/^guest-/.test(user)) req.session.user.picture = crypto.createHash('md5').update(user).digest('hex');
		
		responseObj.user = req.session.user;

        if(!req.secure) {
            queryString  = req._parsedUrl.search?req._parsedUrl.search:"";
            //return res.redirect(307, 'https://'+config.http.host+req.path+queryString);
        }

        if(roomId.indexOf('%') == 0){
          res.end();
          return;  
        }

        core.emit("rooms", {id:roomId,fields:["accounts","members"]}, function(err, room){
            log(room);
            if(room.length>0 && room[0].type =="user") {
                return res.render("error",{error:"Archive view not available for users."});
            }
            if(err) res.render("error", err);
            if(room.length != 0)    responseObj.room = room[0];
            else    responseObj.room = { id : roomId, name:  roomId};
            responseObj.room.title = responseObj.room.id.replace(/(\W+|^)(\w)(\w*)/g, function(m, s, f, r) {
                return f.toUpperCase() + r.toLowerCase() + ' ';
            });
            if (user && user.membership){
				if(user.membership instanceof Array) responseObj.user.membership = user.membership;
				else responseObj.user.membership = Object.keys(user.membership); 
			} 
			
            query.to=roomId;
            query.type="text";
            query.limit=250;
            //disabling this for now.
            // if (params[1]) switch(params[1]) {
            //     case 'since':
            //         query.since=new Date(params[2]).getTime();
            //         break;
            //     case 'until':
            //         query.until=new Date(params[2]).getTime();
            //         break;
            // }
            
            core.emit("messages", query, function(err, m) {
                responseObj.query=query;
                responseObj.messages=m;
                responseObj.relDate = relDate;
                res.render("d/main" , responseObj);
            });
        });
    }
    app.get("/*", roomHandler);
    app.get("/*/edit", roomHandler);




    app.get("/old/*", function(req, res, next) {
        var params = req.path.substring(1).split("/"), responseObj={}, query={}, sqlQuery, roomId = params[1],
        user = req.session.user;
        if(roomId && !validateRoom(roomId)) return next();
        if(params[0]!=="old"){
            return next();
        }
        core.emit("rooms",{id:roomId}, function(err, room){
            if(room.length>0 && room[0].type =="user"){
                return res.render("error",{error:"Archive view not available for users."});
            }
            if(err) res.render("error", err);
            if(room.length != 0){
                responseObj.room = room[0];

                try{
                    responseObj.room.params = JSON.parse(responseObj.room.params);
                }
                catch(e) {
                    responseObj.room.params = {};
                }
            }
            responseObj.user = user.id;
            responseObj.membership=user.membership;

            if(params[1]=="config") {
                next();
                return;
            }
            query.to=params[1];
            query.type="text";
            query.limit=20;

            if (params[2]) switch(params[2]) {
                case 'since':
                    query.since=new Date(params[3]).getTime();
                    break;
                case 'until':
                    query.until=new Date(params[3]).getTime();
                    break;
                case 'edit':
                    return next();
                    break;
            }
            core.emit("messages", query, function(err, m){
                log(query);
                responseObj.query=query;
                responseObj.data=m;
                
                console.log("MESSAGES GAVE ME ", m.length);
                
                if (m[0].type == 'result-start' && m[1]) {
                    responseObj.scrollPrev = new Date(m[1].time).toISOString();
                }
                
                if (m[m.length-1] && m[m.length-1].type == 'result-end') {
                    responseObj.scrollNext = new Date(m[m.length-1].time).toISOString();
                }
                
                query.title=query.to.replace(/(\W+|^)(\w)(\w*)/g, function(m, s, f, r) {
                    return f.toUpperCase() + r.toLowerCase() + ' ';
                });
                
                if (m.length==1 && m[0].type!="text") {
                    delete responseObj.scrollNext;
                    delete responseObj.scrollPrev;
                }
                
                if (!query.since && !query.until) {
                    delete responseObj.scrollNext;
                }
                
                responseObj.relDate = relDate;
                res.render("archive", responseObj);
            });
        });
    });


    // app.get("*/edit/*", function(req, res) {
    //     var params = req.path.substring(1).split("/"), responseHTML = "";
    //     if(params[1] != "edit") {
    //         return next();
    //     }
    //     core.room({id:params[0]},function(err,room) {
    //         if(err) throw err;

    //         if(room.pluginConfig && room.pluginConfig[params[2]]) {
    //             renderObject.config = room.pluginConfig[params[2]];
    //         }

    //         console.log(room);
    //         responseHTML = core.getConfigUi(params[2])(room);
    //         res.writeHead(200, {"Content-Type": "text/html"});
    //         res.end(responseHTML);
    //     });
    // })

    app.get("/s/editRoom", function(req,res) {
		if(!httpConfigResponseObject) {
			httpConfigResponseObject = {};
			core.emit("http/config", {},function(err, payload) {
				httpConfigResponseObject.pluginsUI = payload;
				if(err) return res.render("error",{error:err.message});
				return res.render("newConfig", httpConfigResponseObject);
			});
		}
		else {
			res.render("newConfig", httpConfigResponseObject);
		}
        
    });
	
	app.get("/s/script.js", function(req,res) {
		if(!scriptResponseObject) {
			scriptResponseObject = "";
			core.emit("http/script", {},function(err, payload) {
				for(js in payload) {
					scriptResponseObject += payload[js] + "/n";
				}
				if(err) return res.render("error",{error:err.message});
				res.write(scriptResponseObject);
				return res.end();
				
			});
		}
		else {
			res.write(scriptResponseObject);
			res.end();
		}
        
    });
	

    //commenting out for now. Will not be used.
//     app.get("*/config",function(req, res, next) {
//         var params = req.path.substring(1).split("/"), roomId = params[0], user = req.session.user;
//         if(roomId && !validateRoom(roomId)) return next();
//         console.log(roomId);
//         core.emit("rooms",{id: roomId, fields:["accounts"]}, function(err, room) {
//             if(err) return res.end(err);
//             console.log(room);
//             if(room.length==0) {
//                 room = {
//                     type: "room",
//                     id: params[0]
//                 };  
//             }
//             else{
//                 room = room[0];
//             }
//             if(room.type == "user") {
//                 return res.render("error",{error:"Currently No configuration Available for Users."});
//             }
//             if(user.id.indexOf("guest-")!=0) {
//                 if(typeof room.owner == "undefined" || room.owner == "" || room.owner == user.id) {
//                     var responseObject = {
//                         room: room,
//                         relDate: relDate,
//                         pluginsUI: {}
//                     };
//                     core.emit("config", {},function(err, payload) {
//                         responseObject.pluginsUI = payload;
//                         log(responseObject);
//                         if(err) return res.render("error",{error:err.message});
//                         console.log(responseObject);
//                         return res.render("config", responseObject);            
//                     });
//                 }else{
//                     res.render("error", {error:"You are Not the Admin of this room"});    
//                 }
//             }
//             else{
//                 res.render("error", {error:"Please login..."});   
//             }
            
//         });
//     });
//     app.post("*/config", function(req, res, next) {
//         var params = req.path.substring(1).split("/"), roomId = params[0], user = req.session.user,
//             renderObject = {}, responseHTML = "", data = {};
//         data = req.body || {};

//         if(!validateRoom(roomId)) return next();

//         if(typeof data == "string") {
//             try { data = JSON.parse(data); }
//             catch (e) { res.end(e); }
//         }
//         data.owner = user.id;
//         if(user.id.indexOf("guest-")==0)
//             return res.end(JSON.stringify({error:"You are a guest user."}));
//         if(data.id) {
//             data.owner = user.id;
//             core.emit("room", data, function(err,data) {
//                 if(err) res.end(JSON.stringify({error:err.message}));  
//                 else res.end(JSON.stringify(data));
//             });
//         }
//         else{
//             res.end(JSON.stringify({error:"Improper Data"}));
//         }
    // });
	
};


var relDate= function (input, reference){
                
    var SECOND = 1000,
        MINUTE = 60 * SECOND,
        HOUR = 60 * MINUTE,
        DAY = 24 * HOUR,
        WEEK = 7 * DAY,
        YEAR = DAY * 365,
        MONTH = YEAR / 12;
    
    var formats = [
        [ SECOND, 'a second' ],
        [ 0.7 * MINUTE, 'seconds', SECOND ],
        [ 1.5 * MINUTE, 'a minute' ],
        [ 60 * MINUTE, 'minutes', MINUTE ],
        [ 1.5 * HOUR, 'an hour' ],
        [ DAY, 'hours', HOUR ],
        [ 1.5 * DAY, 'a day' ],
        [ 7 * DAY, 'days', DAY ],
        [ 1.5 * WEEK, 'a week'],
        [ MONTH, 'weeks', WEEK ],
        [ 1.5 * MONTH, 'a month' ],
        [ YEAR, 'months', MONTH ],
        [ 1.5 * YEAR, 'a year' ],
        [ Number.MAX_VALUE, 'years', YEAR ]
    ];
    
    !reference && ( reference = (new Date).getTime() );
    reference instanceof Date && ( reference = reference.getTime() );
    
    input instanceof String && ( input = new Date(input) );
    input instanceof Date && ( input = input.getTime() );
    
    var delta = reference - input,
    format, i, len;
    
    for(i = -1, len=formats.length; ++i < len; ){
        format = formats[i];
        if(delta < format[0]){
            return format[2] == undefined ? format[1] : Math.round(delta/format[2]) + ' ' + format[1];
        }
    };
    return "Long, long";
}