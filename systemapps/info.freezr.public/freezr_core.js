/* Core freezr API - v0.0.122 - 2018-08

The following variables need to have been declared in index.html
    freezr_app_name, freezr_app_token (previously 2019 freezr_app_code), freezr_user_id, freezr_user_is_admin
    freezr web based apps declare these automatically

*/
  var freezr = {
      'db':{},  // data base related functions
      'perms':{}, // grant and query permissions
      'html':{},  // functions to render pages
      'filePath': {},  // functions to generate a correct path to files
      'initPageScripts':null, // initPageScripts can be defined in the app's js file to run initial scripts upon page load.
      'utils':{},
      'menu':{},
      'app': {
        'isWebBased':true,
        'loginCallback':null,
        'logoutCallback':null,
        'server':null
      }
  };

  var freezer_restricted = {
      'utils':{}
  };
  freezr.onFreezrMenuClose = function(hasChanged) {}; // this is called when freezr menu is closed.
  var freezr_app_display_name = freezr_app_display_name? freezr_app_display_name:"";
  var freezr_app_version = freezr_app_version? freezr_app_version:"n/a";
  var freezr_server_version = freezr_server_version? freezr_server_version:"n/a";
// db Functions - data base related functions - to read or write
freezr.db.write = function(data, options, callback) {
  // write to the database
  // options include collection, updateRecord, data_object_id (needed for updateRecord), restoreRecord, confirm_return_fields

  if (!data) {callback({"error":"No data to write."});}

  const contentType='application/json';
  const postData= JSON.stringify({'data':data, 'options':options});
  const collection =  (options && options.collection)? options.collection:"main";
  const app_to_upload = (options.restoreRecord && freezr_app_name=="info.freezr.account")? options.app_name : freezr_app_name;

  const url= "/ceps/write/"+app_to_upload+"/"+collection

  freezer_restricted.connect.send(url, postData, callback, "POST", contentType);
};
freezr.db.upload = function(file, options, callback ) {
  // upload a file and record it in the database
  // options can be: data (a json of data related to file) and updateRecord
  // and file specific ones: targetFolder, fileName, fileOverWrite
  // For files uploaded, colelction is always "files"

  var url= "/ceps/upload/"+freezr_app_name;
  var uploadData = new FormData();
  if (file) {uploadData.append('file', file); /*onsole.log("Sending file1");*/}
  if (options && options.data) {
    uploadData.append("data", JSON.stringify(data));
    delete options.data;
  }
  if (options) uploadData.append("options", JSON.stringify(options));

  freezer_restricted.connect.send(url, uploadData, callback, "PUT", null);
};
freezr.db.getById = function(data_object_id, options, callback ) {
  // get a specific object by object id
  // options are collection_name, permission_name
  if (!data_object_id) {callback({"error":"No id sent."});}
  var requestee_app   = (!options || !options.requestee_app)? freezr_app_name: options.requestee_app;
  var collection_name = (options && options.collection_name)? options.collection_name : "main";
  var permission_name = (options && options.permission_name)? options.permission_name : null;
  let user_id         = (options && options.user_id)? options.user_id : null;

  let url = '/ceps/get/'+requestee_app+'/'+collection_name+(user_id? ('/'+user_id):'')+'/'+data_object_id+ "?"+(requestee_app==freezr_app_name? "":("requestor_app="+freezr_app_name)) + (permission_name? ("permission_name="+permission_name):"")
  freezer_restricted.connect.read(url, null, callback);
}
freezr.db.query = function(options, callback) {
  // queries db
  // options are:
    // permission_name
    // collection - default is to use the first in list for object_delegate
    // app_name can be added optionally to cehck against the app_config permission (which also has it)
    // query_params is any list of query parameters
    // only_others excludes own records

  if (!options) options = {};
  var url = '/ceps/query/'+(options.app_name || freezr_app_name);

  if (options.app_name && options.app_name == "info.freezr.admin") url='/v1/admin/dbquery/'+options.collection
  freezer_restricted.connect.send(url, JSON.stringify(options), callback, 'POST', 'application/json');
}
freezr.db.update = function(data, options, callback) {
  // simple record update, assuming data has a ._id object
  // options can have collection
  if (!data) {callback({"error":"No data sent."});}
  if (!data._id) {callback({"error":"No _id to update."});}
  if (!options) options = {};
  options.updateRecord = true;
  options.data_object_id = data._id;
  freezr.db.write(data, options, callback )
};
freezr.db.getByPublicId = function(data_object_id, callback) {
  // get a specific public object by its object id
  // app_config needs to be set up for this and item to have been permissioned and tagged as public
  if (!data_object_id) {callback({error:'No id sent.'});}
  var url = '/v1/pdb/'+data_object_id;

  freezer_restricted.connect.read(url, options, callback);
}
freezr.db.publicquery = function(options, callback) {
  // options can be: app_name, skip, count, user_id, pid
  if (!options) options = {};
  var url = '/v1/pdbq';
  freezer_restricted.connect.send(url, JSON.stringify(options), callback, 'POST', 'application/json');
}

// Permissions and file permissions
freezr.perms.getAllAppPermissions = function(callback) {
  // gets a list of permissions granted - this is mainly called on my freezr_core, but can also be accessed by apps
  var url = '/v1/permissions/groupall/'+freezr_app_name;
  freezer_restricted.connect.read(url, null, callback);
}
freezr.perms.isGranted = function(permission_name, callback) {
  // see if a permission has been granted by the user - callback(isGranted)
  var url = '/v1/permissions/getall/'+freezr_app_name+'/'+freezr_app_code;
  freezer_restricted.connect.read(url, null, function(ret){
    ret = freezr.utils.parse(ret);
    let isGranted = false;
    ret.forEach((aPerm) => {
      if (aPerm.permission_name == permission_name && aPerm.granted == true) isGranted=true;
    })
    callback(isGranted)
  } );
}
freezr.perms.setObjectAccess = function(permission_name, idOrQuery, options, callback) {
  // gives specific people access to a specific object
  // permission_name is the permission_name under which the field is being

  var url = '/v1/permissions/setobjectaccess/'+freezr_app_name+'/'+permission_name;
  if (!options) {options  =
      { //'action': 'grant' or 'deny' // default is grant
        // can have one of:  'shared_with_group':'logged_in' or 'public' or 'shared_with_user':a user id
        // 'requestee_app': app_name (defaults to self)
        // collection: defaults to first in list
        // pid: sets a publid id instead of the automated accessible_id
        // pubDate: sets the publish date
        // not_accessible - for public items that dont need to be lsited separately in the accessibles database
       }
      }
  if (!options.action) {options.action = "grant";}
  if (!idOrQuery) {
    callback({'error':'must incude object id or a search query'})
  } else {
    if (typeof idOrQuery == "string") options.data_object_id = idOrQuery;
    if (typeof idOrQuery == "object") options.query_criteria = idOrQuery;
    if (idOrQuery.constructor === Array) options.object_id_list = idOrQuery;
    freezer_restricted.connect.write(url, options, callback);
  }
}

// PROMISES create freezr.promise based on above
freezr.promise= {db:{},perms:{}}
Object.keys(freezr.db     ).forEach(aFunc => freezr.promise.db[aFunc]   =null)
Object.keys(freezr.perms  ).forEach(aFunc => freezr.promise.perms[aFunc]=null)
Object.keys(freezr.promise).forEach(typeO => {
  Object.keys(freezr.promise[typeO]).forEach(function(freezrfunc) {
     freezr.promise[typeO][freezrfunc] = function() {
      var args = Array.prototype.slice.call(arguments);
      return new Promise(function (resolve, reject) {
        args.push(function(resp) {
          resp=freezr.utils.parse(resp);
          if (!resp || resp.error) {reject(resp);} else { resolve(resp)}
        })
        freezr[typeO][freezrfunc](...args)
      });
     }
  });
});
freepr = freezr.promise;
// UTILITY Functions
freezr.utils.updateFileList = function(folder_name, callback) {// Currently NOT FUNCTIONAL
  // This is for developers mainly. If files have been added to a folder manually, this function reads all the files and records them in the db
  //app.get('/v1/developer/fileListUpdate/:app_name/:source_app_code/:folder_name', userDataAccessRights, app_hdlr.updateFileDb);
  var url = '/v1/developer/fileListUpdate/'+freezr_app_name+'/'+freezr_app_code+ (folder_name?'/'+folder_name:"");
  //onsole.log("fileListUpdate Sending to "+url)
  freezer_restricted.connect.read(url, null, callback);
}
freezr.utils.getConfig = function(app_name, callback) {
  // This is for developers mainly. I retrieves the app_config file and the list of collections which haev been used
  //app.get('/v1/developer/config/:app_name/:source_app_code',userDataAccessRights, app_handler.getConfig);
  // it returns: {'app_config':app_config, 'collection_names':collection_names}, where collection_names are the collection_names actually used, whether they appear in the app_config or not.

  if (!app_name) app_name = freezr_app_name
  var url = '/v1/developer/config/'+app_name;
  //onsole.log("fileListUpdate Sending to "+url)
  freezer_restricted.connect.read(url, null, callback);
}
freezr.utils.ping = function(options, callback) {
  // pings freezr to get back logged in data
  // options can be password and app_name (Not functional)
  var url = '/v1/account/ping';
  freezer_restricted.connect.read(url, options, callback);

}
freezr.utils.logout = function() {
  if (freezr.app.isWebBased) {
    console.warn("Warning: On web based apps, logout from freezr home.")
    if (freezr.app.logoutCallback) freezr.app.logoutCallback({logged_out:false});
  } else {
    freezer_restricted.connect.ask("/v1/account/applogout", null, function(resp) {
      resp = freezr.utils.parse(resp);
      freezer_restricted.menu.close()
      if (resp.error) {
        console.warn("ERROR Logging Out");
      } else {
        freezr_app_code = null;
        freezr_app_token = null;
        document.cookie = 'app_token_'+freezr_user_id+'='
        freezr_user_id = null;
        freezr_server_address= null;
        freezr_user_is_admin = false;

        if (freezr.app.logoutCallback) freezr.app.logoutCallback(resp);
      }
    });
  }
}
freezr.utils.getHtml = function(part_path, app_name, callback) {
  // Gets an html file on the freezr server
  if (!app_name) app_name = freezr_app_name;
  if (!part_path.endsWith(".html") && !part_path.endsWith(".htm")) {
    callback("error - can only get html files")
  } else {
    var html_url = '/app_files/'+app_name+"/"+part_path;
    freezer_restricted.connect.read(html_url, null, callback);
  }
}
freezr.utils.getAllAppList = function(callback) {
  freezer_restricted.connect.read('/v1/account/app_list.json', null, callback)
}
freezr.utils.filePathFromName = function(fileName, options) {
  console.warn("DEPRECTAED filePathFromId")
}
freezr.utils.filePathFromId = function(fileId, options) {
  console.warn("DEPRECTAED filePathFromId")
}
freezr.utils.userfile = function(user_id,fileName) {return user_id +"/"+fileName}
freezr.utils.setFilePath = function(imgEl, attr, fileId, options){
  if (!options) options={}
  options.requestee_app   =   options.requestee_app || freezr_app_name;
  options.permission_name =   options.permission_name || "self";
  if (!fileId) return null;
  if (freezr.utils.startsWith(fileId,"/")) fileId = fileId.slice(1);
  freezr.utils.getFileToken(fileId, options, function (fileToken) {
    imgEl[attr] =  "/v1/userfiles/"+options.requestee_app+"/"+fileId+"?fileToken="+fileToken+(options.permission_name ?("&permission_name="+options.permission_name):"");
  })
}
freezr.utils.getFileToken = function(fileId, options, callback){
 // WIP - to be completed 2019
 // check if exists - if not, check permissions and send back a token and keep a list of tokens
 // return token
 options.requestee_app   =   options.requestee_app || freezr_app_name;
 options.permission_name =   options.permission_name || "self";

 let url = '/v1/userfileGetToken/'+freezr_app_name+'/'+ (options.permission_name || "self")+'/' + options.requestee_app+'/'+fileId
 freezer_restricted.connect.read(url, null, (resp) => {
    resp=freezr.utils.parse(resp)
    callback (resp.fileToken)
 });

}
freezr.utils.publicPathFromId = function(fileId, requestee_app) {
  // returns the public file path based on the file id so it can be referred to in html.
  // params are permission_name, requestee_app
  if (!fileId || !requestee_app) return null;
  if (freezr.utils.startsWith(fileId,"/")) fileId = fileId.slice(1);
  return "/v1/publicfiles/"+requestee_app+"/"+fileId;
}
freezr.utils.fileIdFromPath = function(filePath) {
  // returns the id given a private or public url of a freezr file path
  if (!filePath) return null;
  let parts = filePath.split("/");
  let type =  ( parts[4]=="userfiles"?"private":(parts[4]=="publicfiles"?"public":null)  )
  if (!type) return null;
  parts = parts.slice( (type=="private"?10:6) )
  return decodeURI(parts.join("/"));
}
freezr.utils.getCookie = function(cname) {
  var name = cname + "=";
  var ca = document.cookie.split(';');
  for(var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}
freezr.utils.parse = function(dataString) {
  if (typeof dataString == "string") {
    try {
          dataString=JSON.parse(dataString);
    } catch(err) {
      dataString= {'data':dataString}
    }
  }
  return dataString
}
freezr.utils.startsWith = function(longertext, checktext) {
    if (!checktext || !longertext) {return false} else
    if (checktext.length > longertext.length) {return false} else {
    return (checktext == longertext.slice(0,checktext.length));}
}
freezr.utils.longDateFormat = function(aDateNum) {
  if (!aDateNum || aDateNum+''=='0') {
    return 'n/a';
  } else {
    try {
      aDate = new Date(aDateNum);
      var retVal = aDate.toLocaleDateString() + ' '+ aDate.toLocaleTimeString();
      return  retVal.substr(0,retVal.length-3);
    } catch (err) {
      return 'n/a - error';
    }
  }
}
freezr.utils.testCallBack = function(returnJson) {
  returnJson = freezer_restricted.utils.parse(returnJson);
  console.log("testCallBack - return json is ",returnJson);
}

/*  ==================================================================

The following functions should NOT be called by apps.
That's why they are called "restricted"
They are for internal purposes only

==================================================================    */
freezer_restricted.utils = freezr.utils;
freezer_restricted.connect= {};
freezer_restricted.menu = {};
freezer_restricted.permissions= {};

// CONNECT - BASE FUNCTIONS TO CONNECT TO SERVER
  freezer_restricted.connect.ask = function(url, data, callback, type) {
      var postData=null, contentType="";

      if (!type || type=="jsonString") {
        postData= data? JSON.stringify(data): "{}";
        contentType = 'application/json'; // "application/x-www-form-urlencoded"; //
      } else {
        postData = data;
      }
      // todo - add posting pictures

  	freezer_restricted.connect.send(url, postData, callback, "POST", contentType);
  };
  freezer_restricted.connect.write = function(url, data, callback, type) {
      var postData=null, contentType="";

      if (!type || type=="jsonString") {
        postData= JSON.stringify(data);
        contentType = 'application/json';
      } else {
        postData=data;
      }
  	freezer_restricted.connect.send(url, postData, callback, "PUT", contentType);
  };
  freezer_restricted.connect.read = function(url, data, callback) {
  	if (data) {
  	    var query = [];
  	    for (var key in data) {
  	        query.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
  	    }
  	    url = url  + '?' + query.join('&');
      }
      freezer_restricted.connect.send(url, null, callback, 'GET', null)
  };
  freezer_restricted.connect.send = function (url, postData, callback, method, contentType) {
    //onsole.log("getting send req for url "+url)
  	let req = null, badBrowser = false;
    if (!callback) callback= freezr.utils.testCallBack;
  	try {
        req = new XMLHttpRequest();
      } catch (e) {
     		badBrowser = true;
      }

      const PATHS_WO_TOKEN=['/ceps/app_token','/v1/account/ping','/v1/admin/first_registration']
      if (badBrowser) {
      	callback({"error":true, "message":"You are using a non-standard browser. Please upgrade."});
      } else if (!freezer_restricted.connect.authorizedUrl(url, method)) {
        callback({"error":true, "message":"You are not allowed to send data to third party sites like "+url});
      } else if (!freezr_app_token && !freezr.utils.getCookie('app_token_'+freezr_user_id) && PATHS_WO_TOKEN.indexOf(url)<0){
        callback({"error":true, "message":"Need to obtain an app token before sending data to "+url});
      } else {
        if (!freezr.app.isWebBased && freezr_server_address) {url = freezr_server_address+url;}
        req.open(method, url, true);
        if (!freezr.app.isWebBased && freezr_server_address) {
          req.withCredentials = true;
          req.crossDomain = true;
        }
        req.onreadystatechange = function() {
          if (req && req.readyState == 4) {
              var jsonResponse = req.responseText;
              //onsole.log("AT freezr - status "+this.status+" resp"+req.responseText)
              jsonResponse = jsonResponse? jsonResponse : {"error":"No Data sent from servers", "errorCode":"noServer"};
              if (this.status == 200 || this.status == 0) {
    				    callback(jsonResponse);
        			} else if (this.status == 400) {
        				callback({'error':((jsonResponse.type)? jsonResponse.type: 'Connection error 400'),'message':'Error 400 connecting to the server', "errorCode":"noServer"});
        			} else {
                if (this.status == 401 && !freezr.app.isWebBased) {freezr.app.offlineCredentialsExpired = true; }
        				callback({'error':"unknown error from freezr server","status":this.status, "errorCode":"noServer"});
        			}
            }
        };
        if (contentType) req.setRequestHeader('Content-type', contentType);
        req.setRequestHeader ('Authorization','Bearer '+ (freezr.app.isWebBased?freezr.utils.getCookie('app_token_'+freezr_user_id): freezr_app_token ))
        //req.setRequestHeader ('Authorization','Bearer '+freezr.utils.getCookie('app_token_'+freezr_user_id) )

        req.send(postData)
      }
  }
  freezer_restricted.connect.authorizedUrl = function (aUrl, method) {
  	if ((freezer_restricted.utils.startsWith(aUrl,"http") && freezr.app.isWebBased) || (!freezer_restricted.utils.startsWith(aUrl,freezr_server_address) && !freezr.app.isWebBased) ){
  		//todo - to make authorized sites
  		var warningText = (method=="POST")? "The web page is trying to send data to ":"The web page is trying to access ";
  		warningText = warningText + "a web site on the wild wild web: "+aUrl+" Are you sure you want to do this?"
  		return (confirm(warningText))
  	} else {
  		return true;
  	}
  }


// MENU - BASE FUNCTIONS SHOWING THEM WHEN THE FREEZR ICON (top right of each app) IS PRESSEDFreeezer Dialogie HTML
  freezer_restricted.menu.hasChanged = false;
  freezer_restricted.menu.addFreezerDialogueElements = function(){
    //onsole.log("addFreezerDialogueElements")
    var freezerMenuButt = document.createElement('img');
    freezerMenuButt.src = freezr.app.isWebBased? "/app_files/info.freezr.public/static/freezer_log_top.png": "./freezrPublic/static/freezer_log_top.png";
    freezerMenuButt.id = "freezerMenuButt"
    freezerMenuButt.onclick = freezer_restricted.menu.freezrMenuOpen;
    freezerMenuButt.className = "freezerMenuButt_" + ((!freezr.app.isWebBased && /iPhone|iPod|iPad/.test(navigator.userAgent) )? "Head":"Norm");
    document.getElementsByTagName("BODY")[0].appendChild(freezerMenuButt);

    var elDialogueOuter = document.createElement('div');
    elDialogueOuter.id = 'freezer_dialogueOuter';
    document.getElementsByTagName("BODY")[0].appendChild(elDialogueOuter);
    var elDialogueScreen = document.createElement('div');
    elDialogueScreen.id = 'freezer_dialogueScreen';
    elDialogueOuter.appendChild(elDialogueScreen);
    elDialogueScreen.onclick = freezer_restricted.menu.close;
    var elDialogueInner = document.createElement('div');
    elDialogueInner.id = 'freezer_dialogueInner';
    elDialogueOuter.appendChild(elDialogueInner);
    var elDialogueCloseButt = document.createElement('div');
    elDialogueCloseButt.className="freezer_butt";
    elDialogueCloseButt.id="freezer_dialogue_closeButt";
    elDialogueCloseButt.innerHTML=" Close ";
    elDialogueCloseButt.onclick = freezer_restricted.menu.close;
    elDialogueInner.appendChild(elDialogueCloseButt);
    if (freezr.app.isWebBased && freezr_user_id && freezr_server_address) {
      // nb server_address and user_id may be nonexistant on app logout and login
      var elDialogueHomeButt = document.createElement('div');
      elDialogueHomeButt.className="freezer_butt";
      elDialogueHomeButt.id="freezer_dialogue_homeButt";
      elDialogueHomeButt.innerHTML="freezr home";
      elDialogueHomeButt.onclick = function (evt) {window.open("/account/home","_self");};
      elDialogueInner.appendChild(elDialogueHomeButt);
    }
    var elDialogueInnerText = document.createElement('div');
    elDialogueInnerText.id = 'freezer_dialogueInnerText';
    elDialogueInner.appendChild(elDialogueInnerText);
    elDialogueInner.style["-webkit-transform"] = "translate3d("+(Math.max(window.innerWidth,window.innerHeight))+"px, -"+(Math.max(window.innerWidth,window.innerHeight))+"px, 0)";
  }
  freezer_restricted.menu.close = function (evt) {
      document.getElementById("freezer_dialogueInner").style["-webkit-transform"] = "translate3d("+(Math.max(window.innerWidth,window.innerHeight))+"px, -"+(Math.max(window.innerWidth,window.innerHeight))+"px, 0)";
      setTimeout(function(){
          document.getElementById('freezer_dialogueOuter').style.display="none";
      },400 )
      var bodyEl = document.getElementsByTagName("BODY")[0]
      if (bodyEl) {bodyEl.style.overflow = "visible"}
      freezr.onFreezrMenuClose(freezer_restricted.menu.hasChanged);
      freezer_restricted.menu.hasChanged = false;
  };
  freezer_restricted.menu.freezrMenuOpen = function() {
    window.scrollTo(0,0);
    var innerEl = document.getElementById('freezer_dialogueInner');

    freezer_restricted.menu.resetDialogueBox();
    freezer_restricted.menu.hasChanged = true;

    if (freezr.app.isWebBased ) { // app pages
      freezer_restricted.menu.addLoginInfoToDialogue('freezer_dialogueInnerText',false);
      if (freezr_app_name!="info.freezr.account" && freezr_app_name!="info.freezr.admin"){
        freezer_restricted.menu.show_permissions();
      }
    } else if (freezr_app_token && !freezr.app.offlineCredentialsExpired) {
      freezer_restricted.menu.addLoginInfoToDialogue('freezer_dialogueInnerText',true);
      freezr.perms.getAllAppPermissions(freezer_restricted.menu.showOfflinePermissions);
    } else if (freezer_restricted.menu.add_standAloneApp_login_dialogue) {
        freezer_restricted.menu.add_standAloneApp_login_dialogue('freezer_dialogueInnerText')
    } else { // no app code, or offlineCredentialsExpired so its a stnad alone app
        document.getElementById('freezer_dialogueInnerText').innerHTML ="Developer error: Please include the freezr_app_post_scripts.js file in your declarations.";
    }

  }
  freezer_restricted.menu.resetDialogueBox = function(isAdminPage, addText) {
    var innerText = (document.getElementById('freezer_dialogueInnerText'));
    if (innerText) innerText.innerHTML= (addText? ("<br/><div>"+addText+"</div>"): "" )+'<br/><div align="center">.<img src="'+(freezr.app.isWebBased? "/app_files/info.freezr.public/static/ajaxloaderBig.gif": "./freezrPublic/static/ajaxloaderBig.gif")+'"/></div>';
    var dialogueEl = document.getElementById('freezer_dialogueOuter');
    if (dialogueEl) dialogueEl.style.display="block";
    var bodyEl = document.getElementsByTagName("BODY")[0]
    if (bodyEl) {
        bodyEl.style.oldOverflow = bodyEl.style.overflow
        bodyEl.style.overflow="hidden";}
    if (dialogueEl && bodyEl) dialogueEl.style.top = Math.round(bodyEl.scrollTop)+"px";
    if (document.getElementById('freezer_dialogueInner')) document.getElementById('freezer_dialogueInner').style["-webkit-transform"] = "translate3d(0, 0, 0)";
  }

  freezer_restricted.menu.show_permissions = function() {
    var url = '/v1/permissions/gethtml/'+freezr_app_name;
    freezer_restricted.connect.read(url, null, function(permHtml) {
      permHtml = freezer_restricted.utils.parse(permHtml);
      permHtml = permHtml.all_perms_in_html
      document.getElementById('freezer_dialogueInnerText').innerHTML+=permHtml;
      freezer_restricted.menu.replace_missing_logos();
    });
  }
  freezer_restricted.menu.replace_missing_logos = function() {
    //let imglist = document.getElementsByClassName("logo_img");
    let imglistener = function(evt){
      this.src="/app_files/info.freezr.public/static/freezer_logo_empty.png"
      this.removeEventListener("error",imglistener);
    }
    Array.from(document.getElementsByClassName("logo_img")).forEach((anImg) => {
      if (anImg.width<20) {
        anImg.src="/app_files/info.freezr.public/static/freezer_logo_empty.png"
      } else {
        anImg.addEventListener("error", imglistener)
      }
    });
  }

  freezer_restricted.menu.addLoginInfoToDialogue = function(aDivName, addTitle) {
    var innerElText = document.getElementById(aDivName);
    if (innerElText) {
        innerElText.innerHTML = addTitle? ("<div class='freezer_dialogue_topTitle'>"+(freezr_app_display_name? freezr_app_display_name:freezr_app_name)+"</div>") : "<br/>";
        innerElText.innerHTML+= (freezr_user_id && freezr_server_address)? ("<i>Logged in as"+(freezr_user_is_admin? " admin ":" ")+"user: "+freezr_user_id+(freezr_server_address? (" on freezr server: "+freezr_server_address): "")+"</i>, version: "+freezr_server_version+"<br/>"):"<br/>You are not logged in";
        innerElText.innerHTML +=  "<br/>";
        innerElText.innerHTML+= (freezr_app_version?("<div>App version: "+freezr_app_version+"</div>"):"" )
        if (!freezr.app.isWebBased){
            innerElText.innerHTML+= '<div align="center"><div class="freezer_butt" style="float:none; max-width:100px;" id="freezr_server_logout_butt">log out</div></div><br/>'
            setTimeout(function() { document.getElementById("freezr_server_logout_butt").onclick= function() {freezr.utils.logout(); } },10);
        }
    } else {console.warn("INTERNAL ERROR - NO DIV AT addLoginInfoToDialogue FOR "+aDivName)}
  }

  // event listeners
  document.onkeydown= function (evt) {
      if (evt.keyCode == 27 && document.getElementById("freezer_dialogueOuter") && document.getElementById("freezer_dialogueOuter").style.display == "block") {freezer_restricted.menu.close()};
  }
  document.addEventListener('click', function (evt) {
    if (evt.target.id && freezr.utils.startsWith(evt.target.id,"freezerperm_") &&  !freezr.utils.startsWith(window.location.pathname,"/account/perms/")) {
      freezer_restricted.menu.close()
      var parts = evt.target.id.split('_');
      let name = parts.slice(4).join("_")
      function getTopLeft(w,h ) { //stackoverflow.com/questions/43913396/how-can-i-get-a-popup-to-be-a-relative-size
        let dualScreenLeft = window.screenLeft != undefined ? window.screenLeft : window.screenX;
        let dualScreenTop = window.screenTop != undefined ? window.screenTop : window.screenY;
        let width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
        let height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;
        let systemZoom = width / window.screen.availWidth;
        return [((height - h) / 2 / systemZoom + dualScreenTop), ((width - w) / 2 / systemZoom + dualScreenLeft)]
      }
      let [top, left] = getTopLeft(600,350)
      window.open("/account/perms/"+parts[1]+"?window=popup&requestor_app="+parts[2]+"&permission_name="+name+"&action="+parts[3],"window","width=600, height=350, toolbar=0, menubar=0, left ="+left+", top="+top)
    }
  });

freezr.utils.addFreezerDialogueElements = freezer_restricted.menu.addFreezerDialogueElements;
freezr.utils.freezrMenuOpen = freezer_restricted.menu.freezrMenuOpen;
freezr.utils.freezrMenuClose = freezer_restricted.menu.close;
