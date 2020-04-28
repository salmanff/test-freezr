// freezr.info - nodejs system files - app_handler.js
exports.version = "0.0.133";

var helpers = require('./helpers.js'),
    db_handler = require("./db_handler.js"),
    user_obj = require("./user_obj.js"),
    async = require('async'),
    file_handler = require('./file_handler.js'),
    apc = require('./objects/app_coll_owner_obj.js');

const DEFAULT_COLLECTION_NAME = "main" // if name is not specified

exports.generatePage = function (req, res) {
  // '/apps/:app_name' and '/apps/:app_name/:page' (and generateDataPage above)
  helpers.log (req,"appPage: "+req.url);

  file_handler.async_app_config(req.params.app_name, req.freezr_environment, function(err, app_config){
    if (err) {
      helpers.warning("app_handler.js", exports.version, "generatePage", "Pass through of app_config ");
      helpers.send_failure(res, 500, err);
    } else {
      var page_name = req.params.page? req.params.page: "index";
      if (!app_config || !app_config.pages) {
        app_config = {pages:{}, is_dummy_app_config:true};
      }
      app_config.pages = app_config.pages || {};
      app_config.pages[page_name] = app_config.pages[page_name] || {}

      db_handler.get_or_set_app_token_for_logged_in_user (req.freezr_environment, req.session.device_code, req.session.logged_in_user_id,  req.params.app_name, function(err, results){
        //onsole.log("in generate page - get_or_set_app_token_for_logged_in_user ",results)
        if (err || !results.app_token) {
            helpers.send_internal_err_page(res, "app_handler", exports.version, "generatePage", "Could not get app token");
        } else {
          req.params.internal_query_token = results.app_token
          if (app_config.pages[page_name].initial_query) {
            // Only takes type: db_query at this time
            const query_params = app_config.pages[page_name].initial_query;
            const app_config_permission_schema = (app_config.permissions && query_params.permission_name)? app_config.permissions[query_params.permission_name]: null;

            if (app_config_permission_schema) {
              req.body.permission_name = query_params.permission_name;
              req.params.app_table = req.params.app_name+(app_config_permission_schema.collection_name?("."+app_config_permission_schema.collection_name):"");
              if (query_params.collection_name && app_config_permission_schema.collection_name != query_params.collection_name) helpers.warning("app_handler", exports.version, "generatePage", "permission schema collections inconsistent with requested collction "+query_params.collection_name+" for app: "+req.params.app_name)
            } else if (query_params.collection_name) {
              req.params.app_table = req.params.app_name+(query_params.collection_name?("."+query_params.collection_name):"");
            } else {
              console.warn("have to define either permission_name or collection_name (for own collections) in initial_query of app_config")
            }

            //onsole.log("initial query data params",query_params,"for app_config",app_config,"req.body.permission_name",req.body.permission_name)

            req.internalcallfwd = function (err, results) {
                if (err) console.warn("State Error "+err)

                req.params.queryresults = {results: results};
                generatePageWithAppConfig(req, res, app_config);
            }
            exports.db_query(req, res);

          } else {
            // todo - check if the files exist first?
            if (app_config.is_dummy_app_config || !app_config.pages[page_name]){
              app_config.pages[page_name]={}
              app_config.pages[page_name].html_file   =  page_name+".html"; // file_handler.appLocalFileExists(req.params.app_name, (page_name+".html"))?  page_name+".html" : null;
              app_config.pages[page_name].css_files   =  page_name+".css"; // file_handler.appLocalFileExists(req.params.app_name, (page_name+".css" ))?  page_name+".css"  : null;
              app_config.pages[page_name].script_files= [page_name+".js"] //file_handler.appLocalFileExists(req.params.app_name, (page_name+".js"  ))? [page_name+".js"]  : null;
            }
            if (!app_config.pages[page_name].page_title) app_config.pages[page_name].page_title = page_name
            generatePageWithAppConfig(req, res, app_config);
          }
        }
      })
    }
  })
}

var generatePageWithAppConfig = function (req, res, app_config) {
    var page_name = req.params.page? req.params.page: "index";
    if (helpers.endsWith(page_name, '.html')) page_name = page_name.slice(0,-5);

    var page_params = {};
    if (app_config && app_config.pages && app_config.pages[page_name]) {
        page_params = app_config.pages[page_name];
    }

    //onsole.log("page_params",page_params)

    var options = {
        page_title: page_params.page_title+" - freezr.info",
        page_url: page_params.html_file? page_params.html_file: './info.freezr.public/fileNotFound.html',
        css_files: [],
        queryresults: (req.params.queryresults || null),
        script_files: [], //page_params.script_files, //[],
        messages: {showOnStart:false},
        user_id: req.session.logged_in_user_id,
        user_is_admin :req.session.logged_in_as_admin,
        app_name: req.params.app_name,
        app_display_name : ( (app_config && app_config.meta && app_config.meta.app_display_name)? app_config.meta.app_display_name:req.params.app_name),
        app_version: (app_config && app_config.meta && app_config.meta.app_version)? app_config.meta.app_version:"N/A",
        other_variables: null,
        freezr_server_version: req.freezr_server_version,
        server_name: req.protocol+"://"+req.get('host')
    }

    db_handler.mark_app_as_used (req.freezr_environment, req.session.logged_in_user_id, req.params.app_name, function(err) {
      if (err) {
        helpers.send_internal_err_page(res, "app_handler", exports.version, "generatePage", "Could not set app as used");
      } else if (!req.params.internal_query_token) {
        helpers.send_internal_err_page(res, "app_handler", exports.version, "generatePage", "app_token missing in generatePageWithAppConfig");
      } else {
        //onsole.log("GEN PAGE WITH XKCD")
        res.cookie('app_token_'+req.session.logged_in_user_id, req.params.internal_query_token,{path:"/apps/"+req.params.app_name});

        //options.messages.showOnStart = (results.newCode && app_config && app_config.permissions && Object.keys(app_config.permissions).length > 0);
        if (page_params.css_files) {
            if (typeof page_params.css_files == "string") page_params.css_files = [page_params.css_files];
            page_params.css_files.forEach(function(css_file) {
                if (helpers.startsWith(css_file,"http")) {
                    helpers.app_data_error(exports.version, "generatePage", req.params.app_name, "Cannot have css files referring to other hosts")
                } else {
                    if (file_handler.fileExt(css_file) == 'css'){
                        options.css_files.push(css_file);
                    } else {
                        helpers.app_data_error(exports.version, "generatePage", req.params.app_name, "Cannot have non js file used as css "+css_file)
                    }
                }
            });
        }
        var outside_scripts = [];
        if (page_params.script_files) {
            if (typeof page_params.script_files == "string") page_params.script_files = [page_params.script_files];
            page_params.script_files.forEach(function(js_file) {
                if (helpers.startsWith(js_file,"http")) {
                    outside_scripts.push(js_file)
                } else {
                    // Check if exists? - todo and review - err if file doesn't exist?
                    if (file_handler.fileExt(js_file) == 'js'){
                        options.script_files.push(js_file);
                    } else {
                        helpers.app_data_error(exports.version, "generatePage", req.params.app_name, "Cannot have non js file used as js.")
                    }
                }
            });
        }

        if (outside_scripts.length>0) {
            db_handler.all_userAppPermissions(req.freezr_environment, req.session.logged_in_user_id, req.params.app_name, function(err, perm_list, cb) {
                if (err) {
                    helpers.send_internal_err_page(res, "app_handler", exports.version, "generatePage", "Could not get user app  permissions");
                } else {
                    if (perm_list.length>0) {
                        outside_scripts.forEach(function(script_requested) {
                            for (var i=0; i<perm_list.length; i++) {
                                var perm_obj = perm_list[i];
                                if (perm_obj.script_url && perm_obj.script_url == script_requested && perm_obj.granted && !perm_obj.denied) {
                                    options.script_files.push(perm_obj.script_url);
                                    break;
                                }
                            }
                        });
                    }
                    file_handler.load_data_html_and_page(res, options, req.freezr_environment);
                }
            })
        } else {
            file_handler.load_data_html_and_page(res, options, req.freezr_environment);
        }
      }
    })
};

// ceps operations
exports.write_record = function (req, res){ // create update or upsert
  // app.post('/ceps/write/:app_table', userDataAccessRights, app_handler.write_record);
  // app.put('/ceps/update/:app_table/:data_object_id', userDataAccessRights, app_handler.write_record)
  // app.post('/feps/write/:app_table', userDataAccessRights, app_handler.write_record);
  // app.post('/feps/write/:app_table/:data_object_id', userDataAccessRights, app_handler.write_record);
  // app.post('/feps/upsert/:app_table', userDataAccessRights, app_handler.write_record);

  helpers.log (req,"ceps writeData at "+req.url+" body:"+JSON.stringify((req.body)? req.body:" none"));
  let user_id, write, data_object_id;
  let requestor_app, collection_name, app_config, data_model, appcollowner, app_err, app_auth;
  let own_collection=false
  const is_upsert = (req.query.upsert=='true')
  const is_update = helpers.startsWith(req.url,"/ceps/update") || helpers.startsWith(req.url,"/feps/update");
  const replaceAllFields = is_update && (req.query.replaceAllFields || helpers.startsWith(req.url,"/ceps/update") )
  const is_ceps = helpers.startsWith(req.url,"/ceps/")
  const is_query_based_update = (!is_ceps && is_update && !req.params.data_object_id && req.body.q && req.body.d)

  async.waterfall([
    // 1. check app token .. and set user_id based on record if not a param...
    function (cb) {
      db_handler.check_app_token_and_params(req, {}, cb)
    },
    // 2. get requestor_app to initialise variables and check for completness
    function (token_user_id, token_app_name, logged_in, cb) {
        requestor_app = token_app_name;

        appcollowner = new AppCollOwner(req.params.app_table, {requestor_app:requestor_app, owner:token_user_id})

        write = req.body || {};
        data_object_id= (is_upsert || is_update)? req.params.data_object_id : ( req.body._id? (req.body._id+"") : null);

        app_err = function (message) {return helpers.app_data_error(exports.version, "write_record", requestor_app, message);}
        app_auth = function (message) {return helpers.auth_failure("app_handler", exports.version, "write_record", requestor_app+": "+message);}

        if (!is_upsert && !is_update && Object.keys(write).length<=0 ) {
          cb(app_err("Missing data parameters."));
        } else if (!appcollowner.own_collection || appcollowner.app_name!=requestor_app) { // note the two conditions are equivalent
          cb(app_err("CEPs has not defined write permissions - Can only write to tables containing app name"))
        } else if (helpers.is_system_app(requestor_app)) {
          cb(helpers.invalid_data("app name not allowed: "+requestor_app, "account_handler", exports.version, "write_record"));
        } else if (is_ceps && (is_upsert || (is_update && !data_object_id))) {
          cb(app_err("CEPs is not yet able to do upsert, and key only updates and query based updates."))
        } else {
          cb(null);
        }
    },
    // 3. get app config
    function (cb) {
      file_handler.async_app_config(requestor_app, req.freezr_environment,cb);
    },
    // ... and make sure write object conforms to the model
    function (got_app_config, cb) {
      app_config = got_app_config;
      data_model= (app_config && app_config.collections && app_config.collections[appcollowner.collection_name])? app_config.collections[appcollowner.collection_name]: null;

      if (!newObjectFieldNamesAreValid(write, data_model, {update:is_update})) {
        cb(app_err("invalid field names"));
      } else if (appcollowner.collection_name && !collectionIsValid(appcollowner.collection_name,app_config,false)){
        cb(app_err("Collection name "+appcollowner.collection_name+"is invalid."));
      } else if (!data_object_id && !is_upsert && !is_update) { // Simple create object with no id
        cb(null, null);
      }  else if (is_upsert || (is_update && data_object_id)) { // is_upsert or update
        db_handler.read_by_id (req.freezr_environment, appcollowner, data_object_id, function(err, results) {
          cb((is_upsert? null: err), results)
        })
      } else if (is_update && is_query_based_update) { // just to mass update
        cb(null, null)
      } else {
        cb(app_err("Malformed path body combo "+JSON.stringify( appcollowner)));
      }
    },

    // 4. write
    function (results, cb) {
      if (is_query_based_update){ // no results needed
        db_handler.update (req.freezr_environment, appcollowner, write.q, write.d,{replaceAllFields:false /*redundant*/}, cb)
      } else if (results) {
        if (is_upsert || (is_update && results._date_created /*ie is non empty record*/) ){ // one entity
          db_handler.update (req.freezr_environment, appcollowner, data_object_id, write,{replaceAllFields:replaceAllFields, old_entity:results}, cb)
        } else {
          let errmsg = is_upsert? "internal err in old record":"Record exists - use 'update' to update existing records"
          cb(helpers.auth_failure("app_handler", exports.version, "write_record", requestor_app, errmsg));
        }
      } else if (is_update) { // should have gotten results
        cb(app_err("record not found") );
      } else { // new document - should not have gotten results
        db_handler.create(req.freezr_environment, appcollowner, data_object_id, write, {restoreRecord: false}, cb)
      }
    }
    ],
    function (err, write_confirm) {
      //onsole.log("write err",err,"write_confirm",write_confirm)
      if (err) {
        helpers.send_failure(res, err, "app_handler", exports.version, "write_record");
      } else if (!write_confirm ){
        helpers.send_failure(res, new Error("unknown write error"), "app_handler", exports.version, "write_record");
      } else if (is_update || is_upsert){
        helpers.send_success(res, write_confirm);
      } else {
        ({_id, _date_created, _date_modified} = write_confirm.entity)
        helpers.send_success(res, {_id, _date_created, _date_modified});
      }
    });
}
exports.read_record_by_id= function(req, res) {
  //app.get('/ceps/read/:app_table/:data_object_id', userDataAccessRights, app_handler.read_record_by_id);
  // app.get('/feps/read/:app_table/:data_object_id/:requestee_user_id', userDataAccessRights, app_handler.read_record_by_id);
    // feps option: "?"+(requestee_app==freezr_app_name? "":("requestor_app="+freezr_app_name)) + (permission_name? ("permission_name="+permission_name):"")

  //  app.get('/feps/userfileGetToken/:permission_name/:requestee_app_name/:requestee_user_id/*', userDataAccessRights, app_handler.read_record_by_id); // collection_name is files
    // collection name is 'files'

  let permission_name = req.params.permission_name || req.query.permission_name  // params in file get and query for ceps
  let requestee_user_id = req.params.requestee_user_id;
  let data_object_id, requestor_app, requestor_user_id, collection_name, own_collection;

  let record_is_permitted = false,
      the_granted_perm = null,
      resulting_record = null,
      own_record=false;
  let app_err, app_auth;

  // Initialize variables
  let request_file = helpers.startsWith(req.path,"/feps/getuserfiletoken") ;
  if (request_file) {
    req.params.app_table = req.params.requestee_app_name+".files";
    requestee_user_id = req.params.requestee_user_id;
    let parts = req.originalUrl.split('/');
    //data_object_id=unescape(parts.slice(7))
    data_object_id=parts[5]+"/"+unescape(parts.slice(6))
    if (data_object_id.indexOf('?')>-1) {
      let parts2=data_object_id.split('?');
      data_object_id = parts2[0]
    }
    //onsole.log("files url was ",req.originalUrl, "and data_object_id now is ",data_object_id)
  } else {
    data_object_id = req.params.data_object_id;
  }

  async.waterfall([
    // 1. check app token ..
    function (cb) {
      db_handler.check_app_token_and_params(req, {}, cb)
    },
    // ... and set app_name and user_id to initialise variables and check
    function (token_user_id, token_app_name, logged_in, cb) {
        requestor_user_id = token_user_id;
        if (!requestee_user_id) requestee_user_id=token_user_id;

        requestor_app = token_app_name;
        if (request_file) {
          appcollowner = new AppCollOwner(req.params.app_table, {requestor_app:requestor_app, owner:requestee_user_id})
        } else {
          appcollowner = new AppCollOwner(req.params.app_table, {requestor_app:requestor_app, owner:requestee_user_id})
        }

        app_err = function (message) {return helpers.app_data_error(exports.version, "read_record_by_id", requestor_app, message);}
        app_auth = function (message) {return helpers.auth_failure("app_handler", exports.version, "read_record_by_id", requestor_app+": "+message);}

        if (helpers.startsWith(req.params.app_table,"info.freezr.admin") || requestor_app == "info.freezr.admin") {
          // NB this should be redundant but adding it in any case
          cb(app_auth("Should not access admin db via this interface"));
        } else {
          if ( requestor_app==appcollowner.app_name && requestor_user_id == requestee_user_id){
            own_record = true;
            record_is_permitted = true;
          }
          cb(null)
        }
    },

    // 2. get item.. if own_record, go to end. if not, get all record permissions
    function (cb) {
      db_handler.read_by_id (req.freezr_environment, appcollowner, data_object_id, cb)
    },

    // 3. get permissions if needbe
    function (results, cb) {
      resulting_record = results;
      if (!resulting_record) {
        cb(app_err("no related records"))
      } else if (record_is_permitted) {
        cb(null, null)
      } else if (!permission_name){
        cb(app_auth("Need to specify permission name to get object "));
      } else {
        db_handler.granted_permissions_by_owner_and_apps (req.freezr_environment, requestee_user_id, requestor_app, req.params.app_table, cb)
      }
    },

    // 4.. and check against record permissions - Note this step would be redundant if database updates properly after a premission has been revoked, but even if that was relatively assured (which it isnt as of 2019, this is provides extra reducnacy)
    function (permissions_granted, cb) {
        if (record_is_permitted) {
          cb(null)
        } else if (!permissions_granted || permissions_granted.length==0) {
            cb(app_auth("No granted permissions exist"));
        } else {
          let granted_perm_names = [], have_access = false
          permissions_granted.forEach(aPerm => {granted_perm_names.push(aPerm.permission_name)})

          function check_access(record_accesses){
            let result = null
            record_accesses.forEach(aPerm => {
              let [app_name, perm_name] = aPerm.split('/')
              if (requestor_app == app_name && granted_perm_names.indexOf(permission_name)>-1) {
                result = true;
                the_granted_perm=aPerm;
              }
            })
            return result
          }

          let loggedInAccess = (resulting_record._accessible_By && resulting_record._accessible_By.group_perms && resulting_record._accessible_By.group_perms.logged_in)? resulting_record._accessible_By.group_perms.logged_in: null;
          if (loggedInAccess && loggedInAccess.length>0) {
            //("todo - need to make sure type of token is for logged in people so can have different types eg authed or logged_in")
            have_access = check_access(loggedInAccess)
          }
          let publicAccess = (resulting_record._accessible_By && resulting_record._accessible_By.group_perms && resulting_record._accessible_By.group_perms.public)? resulting_record._accessible_By.group_perms.public : null;
          if (!have_access && publicAccess && publicAccess.length>0) {
              have_access = have_access || check_access(publicAccess);;
          }
          let userAccess = (resulting_record._accessible_By && resulting_record._accessible_By.user_perms && resulting_record._accessible_By.user_perms[req.params.requestor_id])? resulting_record._accessible_By.user_perms[req.params.requestor_id] : null;
          if (!have_access && userAccess && userAccess.length>0) {
            have_access = have_access || check_access(userAccess);;
          }
          if (!have_access) {
            cb(app_auth("No granted permissions match"));
          } else {
            record_is_permitted = true;
            cb(null)
          }
        }
    },


    ],
    function (err) {
        //onsole.log("got to end of read_record_by_id");
        if (!record_is_permitted || err) {
          helpers.send_failure(res, err, "app_handler", exports.version, "read_record_by_id");
        } else if (request_file){
          helpers.send_success(res, {'fileToken':getOrSetFileToken(requestee_user_id,req.params.requestee_app_name,data_object_id)});
        } else {
          // todo - permission_model has to come from the perm
          if (requestee_user_id!=requestor_user_id && !request_file && the_granted_perm && the_granted_perm.return_fields && the_granted_perm.return_fields.length>0) {
              let new_record = {};
              for (var i=0; i<the_granted_perm.return_fields.length; i++) {
                  new_record[the_granted_perm.return_fields[i]] = resulting_record[the_granted_perm.return_fields[i]];
              }
              resulting_record = new_record;
          }
          helpers.send_success(res, resulting_record);
        }
    });
}
exports.db_query = function (req, res){
    helpers.log (req,"db_query -- in app_hanlder: "+req.url+" body "+JSON.stringify(req.body))
    //app.get('/ceps/query/:app_table', userDataAccessRights, app_handler.db_query); (req.params contain query)
    //app.get('/feps/query/:app_table', userDataAccessRights, app_handler.db_query); (same as ceps)
    //app.post('/feps/query/:app_table', userDataAccessRights, app_handler.db_query);
      // body: permission_name, user_id (ie requestee id), q (query params), only_others, sort

    let params = {}

    req.app_auth_err = function (message) {return helpers.auth_failure("app_handler", exports.version, "db_query", message+" "+req.params.app_table);}

    if (!req.body || helpers.isEmpty(req.body) && req.query && !helpers.isEmpty(req.query)) req.body = {q:req.query} // in case of a GET statement (ie move query to body)

    let permission_name = req.body.permission_name;
    let appcoll, requestor = {};

    db_handler.check_app_token_and_params(req, {}, function(err, token_user_id, token_app_name, logged_in) {
      //onsole.log("query  token_user_id:"+ token_user_id+"  token_app_name:"+token_app_name)
      requestor.user_id = token_user_id;
      requestor.app_name = token_app_name;
      // special case for query from accounts folder for "view or backup data"
      if (token_app_name=="info.freezr.account" && req.body.app_name) requestor.app_name = req.body.app_name

      if (req.body.app_name=="info.freezr.admin" && req.session.logged_in_as_admin) {
        requestor.user_id="fradmin"
      }

      appcoll = appcoll_from_app_table(req.params.app_table, requestor.app_name)

      // req.params.user_id is requestee
      if (err) {
        console.warn(err)
        helpers.send_failure(res, req.app_auth_err("error getting device token"), "app_handler", exports.version, "db_query");
      //ie own_record
      } else if (!permission_name) { //ie own_record
        if (appcoll.own_collection) {
          let usersWhoGrantedAppPermission = [requestor.user_id]; // if requestor is same as requestee then user is automatically included
          do_db_query(req,res, requestor, appcoll, usersWhoGrantedAppPermission, {})
        } else {
          helpers.send_failure(res, req.app_auth_err("Need a persmission name to access others' apps and records "+JSON.stringify(requestor) ), "app_handler", exports.version, "db_query");
        }
      } else {
        options = {only_others: req.body.only_others, q:req.body.q}
        get_all_query_perms(req.freezr_environment , requestor, appcoll, permission_name, options,
          function(err, usersWhoGrantedAppPermission, app_config_permission_schema){
            console.warn("Need to redo permissions on records.")
            console.warn("usersWhoGrantedAppPermission ",usersWhoGrantedAppPermission)
            if (err) {
              helpers.send_failure(res, err, "app_handler", exports.version, "get_all_query_perms");
            } else {
              do_db_query(req,res, requestor, appcoll, usersWhoGrantedAppPermission, app_config_permission_schema)
            }
          }
        )
      }
    })
}
do_db_query = function (req,res, requestor, appcoll, usersWhoGrantedAppPermission, app_config_permission_schema) {
  // does the db_query after basic security checks - ie who has authorised tthe request and app tokem validation
  // all appcoll paramatewrs must have beeb checked before do_db_query
  //onsole.log("doing query for usersWhoGrantedAppPermission", usersWhoGrantedAppPermission)

  //onsole.log("do db query",req.body.query_params,"usersWhoGrantedAppPermission:",usersWhoGrantedAppPermission, "appcoll",appcoll)
  // to do - not ethat count right now is a count per person

  let skip = req.body.skip? parseInt(req.body.skip): 0;
  let count= req.body.count? parseInt(req.body.count):(req.params.max_count? req.params.max_count: 50);
  if (app_config_permission_schema.max_count && count+skip>app_config_permission_schema.max_count) {
    count = Math.max(0,app_config_permission_schema.max_count-skip);
  }
  let sort = app_config_permission_schema.sort_fields || req.body.sort;
  if (!sort) sort = {'_date_modified': -1} // default
  if (!req.body.q) req.body.q = {}
  if (req.body.q._modified_before) {
    req.body.q._date_modified = {$lt:parseInt(req.body.q._modified_before+0)}
    delete  req.body.q._modified_before
  }
  if (req.body.q._modified_after) {
    req.body.q._date_modified = {$gt:parseInt(req.body.q._modified_after+0)}
    delete  req.body.q._modified_after
  }
  //onsole.log("In query to find", JSON.stringify (req.body.q))
  //onsole.log("In query sort is ",sort)
  //onsole.log("In query count is ",req.body.count)
  let all_permitted_records = [], return_fields= null;

  if (app_config_permission_schema && app_config_permission_schema.return_fields && app_config_permission_schema.return_fields.length>0) {
    return_fields = app_config_permission_schema.return_fields;
    return_fields.push("_date_modified");
  }
  const reduce_to_permitted_fields = function(record,  return_fields) {
    if (!return_fields) return record;
    let return_obj = {};
    return_fields.forEach( (a_field) => return_obj[a_field] = record[a_field] );
    return return_obj;
  }

  //onsole.log("usersWhoGrantedAppPermission",usersWhoGrantedAppPermission)

  async.forEach(usersWhoGrantedAppPermission, function (permitter, cb) {
    //onsole.log("setting "+acc_obj._id)
    appcoll.owner = permitter
    if (app_config_permission_schema.type=="object_delegate") {
      let perm_string = requestor.app_name+"/"+app_config_permission_schema.name;
      if (app_config_permission_schema.sharable_group == 'public') req.body.q._accessible_By = {group_perms: {public : perm_string}}
      //if (app_config_permission_schema.sharable_group == 'logged_in' && req.session.logged_in_user_id) req.body.q._accessible_By = {group_perms: {logged_in : perm_string}}
      if (app_config_permission_schema.sharable_group == 'logged_in' && req.session.logged_in_user_id) req.body.q['_accessible_By.group_perms.logged_in'] = perm_string
      if (app_config_permission_schema.sharable_group == 'user' && requestor.user_id) {
        req.body.q['_accessible_By.user_perms.'+requestoruser_id] = perm_string
        //req.body.q._accessible_By = {user_perms: {} }
        //req.body.q._accessible_By.user_perms[requestoruser_id] = perm_string;
      }
    }
    let appcollowner = JSON.parse(JSON.stringify(appcoll))
    appcollowner.owner = permitter
    //onsole.log("looking at permitter ", permitter, "appcollowner", appcollowner, "req.body.q",req.body.q,sort,count,skip)
    db_handler.query(req.freezr_environment, appcollowner, req.body.q,
      {sort: sort, count:count, skip:skip}, function(err, results) {
        //onsole.log(results)
      if (results){
        if (app_config_permission_schema) results.map(anitem => anitem._owner = permitter)
        for (record of results) {
          //("todo - make this functional - 2020")
          all_permitted_records.push(reduce_to_permitted_fields(record, return_fields));
        }
      }
      cb(null)
    })
  },
  function (err) {
    //onsole.log("all_permitted_records",all_permitted_records)
    const sorter = function(sort_param) {
      key = Object.keys(sort_param)[0];
      return function(obj1, obj2) {(sort_param[key]>0? (obj1[key]>obj2[key]) : obj1[key]<obj2[key]  )}
    }
    all_permitted_records.sort(sorter(sort))

    if (app_config_permission_schema.max_count && all_permitted_records.length>app_config_permission_schema.max_count)  all_permitted_records.length=app_config_permission_schema.max_count
    if (req.internalcallfwd){
      req.internalcallfwd(err, all_permitted_records)
    } else if (err) {
      helpers.send_failure(res, err, "app_handler", exports.version, "do_db_query");
    } else {
      helpers.send_success(res, all_permitted_records);
    }
  })
}
get_all_query_perms = function (env_params , requestor, appcoll, permission_name, options, callback) {
  // reviews all query params to see who has granted permission on which app
  // This is only called upon when there is a permission_name - ie query is not for the app's own data (same user and same app)
  let app_config, app_config_permission_schema;
  let usersWhoGrantedAppPermission =[];
    // if requestor is same as requestee then user is automatically included

    function app_err(message) {return helpers.app_data_error(exports.version, "get_all_query_perms", requestor+permission_name, message);}
    function app_auth(message) {return helpers.auth_failure("app_handler", exports.version, "get_all_query_perms",requestor+permission_name+": "+ message);}

  async.waterfall([
    // 1 get app config
    function (cb) {
      file_handler.async_app_config(requestor.app_name, env_params,cb);
    },
    // .. and app_config_permission_schema and check all data needed exists
    function (the_app_config, cb) {
      app_config = the_app_config;
      app_config_permission_schema = (app_config && app_config.permissions)? app_config.permissions[permission_name]: null;

      //onsole.log("app_config_permission_schema permission_name ",permission_name,"requestor ",requestor,"app_config_permission_schema",app_config_permission_schema)

      if (!app_config_permission_schema.requestee_app_table) app_config_permission_schema.requestee_app_table = requestor.app_name + (app_config_permission_schema.collection_name?("."+app_config_permission_schema.collection_name):"");
      if (app_config_permission_schema) app_config_permission_schema.name = permission_name;

      if (!app_config){
        cb(app_err("Missing app_config for ",requestor.app_name));
      } else if (!app_config_permission_schema || !permission_name){
        cb(app_err("Missing permission_schema for ",requestor.app_name));
      } else if (!app_config_permission_schema.sharable_group){
        cb(app_err("No sharable groups declared for permission ",permission_name,requestor.app_name));
      } else if (appcoll.app_table != app_config_permission_schema.requestee_app_table) {
        console.warn("{appcoll}", appcoll,"app_config_permission_schema",app_config_permission_schema)
        cb(app_auth_err("app_table not allowed by permission"))
      } else {
        cb(null);
      }
    },

    // 2. Get app permission
    function (cb) {
        db_handler.all_granted_app_permissions_by_name(env_params, requestor.app_name, appcoll.app_table, permission_name, null , cb)
    },
    // ... and add the people who have granted the permission to usersWhoGrantedAppPermission list
    function (allUserPermissions, cb) {
      //onsole.log("allUserPermissions",allUserPermissions,"appcoll, requester",appcoll, requestor)
      usersWhoGrantedAppPermission = allUserPermissions.map(aperm => aperm.permitter)
      if (appcoll.app_name == requestor.app_name){
        if (options.only_others) {
          usersWhoGrantedAppPermission =  helpers.removeFromListIfExists (usersWhoGrantedAppPermission, requestor.user_id)
        } else {
          usersWhoGrantedAppPermission =  helpers.addToListAsUnique (usersWhoGrantedAppPermission, requestor.user_id)
        }
      }
      if (usersWhoGrantedAppPermission.length>0) {
          cb(null)
      } else {
          cb(app_auth_err("No users have granted permissions for permission:"+req.body.permission_name));
      }
    },

    // adds specific criteria to the query parameters todo 2020 recheck this check_query_params_permitted
    function (cb) {
      if (app_config_permission_schema.type=="db_query") {
        // permitted query_params - todo - this should bemoved to another function
        const check_query_params_permitted = function(query_params,permitted_fields){
          let err = null;
          if (isArray(query_params)) {
            query_params.forEach(function (item) {
              err = err || check_query_params_permitted(item,permitted_fields)
            });
          } else {
            for (let key in query_params) {
              if (key == '$and' || key == '$or') {
                return check_query_params_permitted(query_params[key],permitted_fields)
              } else if (['$lt','$gt','_date_modified'].indexOf(key)>-1) {
                // do nothing
              } else if (permitted_fields.indexOf(key)<0) {
                return (new Error("field not permitted "+key))
              }
            }
          }
          return(err)
        }
        if (app_config_permission_schema.permitted_fields && app_config_permission_schema.permitted_fields.length>0 && Object.keys(req.body.q).length > 0) {
          cb( check_query_params_permitted(req.body.q,app_config_permission_schema.permitted_fields))
        } else {
          cb(null)
        }
      } else {
        cb(null)
      }
    }
  ],
  function (err) {
    if (err) {
      callback(err, null)
    } else {
      callback(null, usersWhoGrantedAppPermission, app_config_permission_schema)
    }
  })
}

exports.create_file_record = function (req, res){
  helpers.log (req,"ceps writeData at "+req.url+"body:"+JSON.stringify((req.body && req.body.options)? req.body.options:" none"));

  let user_id, write, data_object_id;
  let requestor_app, app_table, app_config, data_model, appcollowner, app_err, app_auth;
  const collection_name="files"
  let own_collection=false

  let fileParams = {'dir':"", 'name':"", 'duplicated_file':false};
  fileParams.is_attached = (req.file)? true:false;
  if (req.body.options && (typeof req.body.options == "string")) req.body.options = JSON.parse(req.body.options); // needed when upload file
  if (req.body.data && (typeof req.body.data == "string")) req.body.data = JSON.parse(req.body.data); // needed when upload file

  const is_update = false; // re-revie for doing updates

  async.waterfall([
    // 1. check app token .. and set user_id based on record if not a param...
    function (cb) {
      db_handler.check_app_token_and_params(req, {}, cb)
    },
    // 2. get requestor_app to initialise variables and check for completness
    function (token_user_id, token_app_name, logged_in, cb) {
        requestor_app = token_app_name;
        user_id = token_user_id
        app_table = requestor_app+".files"

        appcollowner = new AppCollOwner(app_table, {requestor_app:requestor_app, owner:token_user_id})

        write = req.body.data || {};

        app_err = function (message) {return helpers.app_data_error(exports.version, "write_record", requestor_app, message);}
        app_auth = function (message) {return helpers.auth_failure("app_handler", exports.version, "write_record", requestor_app+": "+message);}

        if (!fileParams.is_attached) {
          cb(app_err("Missing file"));
        } else if (helpers.is_system_app(requestor_app)) {
          cb(helpers.invalid_data("app name not allowed: "+requestor_app, "account_handler", exports.version, "write_record"));
        } else {
          cb(null);
        }
    },
    // 3. get app config
    function (cb) {
      file_handler.async_app_config(requestor_app, req.freezr_environment,cb);
    },
    // ... and make sure write object conforms to the model
    function (got_app_config, cb) {
      app_config = got_app_config;
      data_model = (app_config && app_config.files)? app_config.files: {};

      fileParams.dir = (req.body.options && req.body.options.targetFolder)?req.body.options.targetFolder : "";
      data_object_id = file_handler.removeStartAndEndSlashes(user_id+"/"+file_handler.removeStartAndEndSlashes(""+fileParams.dir));
      fileParams.dir = file_handler.normUrl(file_handler.removeStartAndEndSlashes("userfiles/"+user_id+"/"+req.params.app_name+"/"+file_handler.removeStartAndEndSlashes(""+fileParams.dir)) );
      fileParams.name = ( req.body.options && req.body.options.fileName)?req.body.options.fileName : req.file.originalname;

      // check if file is sent but shouldnt be
      if (data_model.do_not_allow) {
        cb(app_err("config doesnt allow file uploads."));
      } else if (!newObjectFieldNamesAreValid(write, data_model, {update:is_update})) {
        cb(app_err("invalid field names"));
      } else if (!helpers.valid_filename(fileParams.name) ) {
        cb(app_err("Invalid file name"));
      } else if (data_model.allowed_file_types && data_model.allowed_file_types.length>0 && data_model.allowed_file_types.indexOf(file_handler.fileExt(fileParams.name))<0 ){
          cb(app_err("invalid file type"));
      } else if (!file_handler.valid_path_extension(fileParams.dir)) {
          cb(app_err("invalid folder name"));
      } else {
          data_object_id = data_object_id+"/"+fileParams.name;
          file_handler.writeUserFile(fileParams.dir, fileParams.name, req.body.options, data_model, req, cb);
      }
    },

    // 4. write
    function (new_file_name, cb) {
      if (new_file_name != fileParams.name) {
        var last =  data_object_id.lastIndexOf(fileParams.name);
        if (last>0) {
          data_object_id = data_object_id.substring(0,last)+new_file_name;
        } else {
          cb(app_err("SNBH - no file name in obejct id"))
        }
      }
      db_handler.create(req.freezr_environment, appcollowner, data_object_id, write, {restoreRecord: false}, cb)
    }
    ],
    function (err, write_confirm) {
      //onsole.log("err",err,"write_confirm",write_confirm)
      if (err) {
        helpers.send_failure(res, err, "app_handler", exports.version, "create_file_record");
      } else if (!write_confirm ){
        helpers.send_failure(res, new Error("unknown write error"), "app_handler", exports.version, "create_file_record");
      } else if (is_update){
        helpers.send_success(res, write_confirm);
      } else {
        ({_id, _date_created, _date_modified} = write_confirm.entity)
        helpers.send_success(res, {_id, _date_created, _date_modified});
      }
    });

}
exports.delete_record = function (req, res){
  helpers.log (req,"ceps delete_record at "+req.url);

  let user_id, write, data_object_id;
  let requestor_app, collection_name, app_config, data_model, appcollowner, app_err, app_auth;
  let own_collection=false

  async.waterfall([
    // 1. check app token .. and set user_id based on record if not a param...
    function (cb) {
      db_handler.check_app_token_and_params(req, {}, cb)
    },
    // 2. get requestor_app to initialise variables and check for completness
    function (token_user_id, token_app_name, logged_in, cb) {
      requestor_app = token_app_name;
      appcollowner = new AppCollOwner(req.params.app_table, {requestor_app:requestor_app, owner:token_user_id})
      data_object_id= req.params.data_object_id;

      app_err = function (message) {return helpers.app_data_error(exports.version, "delete_record", requestor_app, message);}
      app_auth = function (message) {return helpers.auth_failure("app_handler", exports.version, "delete_record", requestor_app+": "+message);}

      file_handler.async_app_config(requestor_app, req.freezr_environment,cb);
    },
    // ...end above with getting app config and make sure you are allowed to delete
    function (got_app_config, cb) {
      app_config = got_app_config;

      // todo 2020 later to check if app allows deletes
      data_model= (app_config && app_config.collections && app_config.collections[appcollowner.collection_name])? app_config.collections[appcollowner.collection_name]: null;
      db_handler.delete_record(req.freezr_environment, appcollowner, data_object_id, null, cb)
    }
    ],
    function (err, delete_confirm) {
      //onsole.log("err",err,"delete_confirm",delete_confirm)
      if (err) {
        helpers.send_failure(res, err, "app_handler", exports.version, "delete_record");
      } else if (!delete_confirm ){
        helpers.send_failure(res, new Error("unknown write error"), "app_handler", exports.version, "delete_record");
      } else {
        helpers.send_success(res, {success:true});
      }
    });
}
exports.restore_record = function (req, res){
  // app.post('/feps/restore/:app_table', userDataAccessRights, app_handler.restore_record)
  // bidy has record and options: password, KeepUpdateIds, updateRecord, data_object_id


  helpers.log (req,"ceps restore_record at "+req.url+" body:"+JSON.stringify((req.body)? req.body:" none"));
  let user_id;
  const write = req.body.record
  const options = req.body.options || {KeepUpdateIds:false}
  const data_object_id = options.data_object_id
  const is_update = data_object_id && options.updateRecord

  let app_config, data_model, appcollowner;

  const app_err = function (message) {return helpers.app_data_error(exports.version, "restore_record", (options.app_name || req.params.app_table), message);}
  const app_auth = function (message) {return helpers.auth_failure("app_handler", exports.version, "restore_record", req.params.app_table+": "+message);}

  async.waterfall([
    // 1. check app token .. and set user_id based on record if not a param...
    function (cb) {
      let checks = {user_id: req.session.user_id, logged_in:true, requestor_app:["info.freezr.account"]}
      db_handler.check_app_token_and_params(req, {}, cb)
    },
    // 2. get requestor_app to initialise variables and check for completness
    function (token_user_id, token_app_name, logged_in, cb) {
      let permission_restore = (req.params.app_table == "info.freezr.admin.accessibles")
      table_owner =permission_restore?  "fradmin":req.session.logged_in_user_id;

      appcollowner = new AppCollOwner(req.params.app_table, {collection_name:options.collection_name, requestor_app:options.app_name, owner:table_owner})

      if (Object.keys(write).length<=0 ) {
        cb(app_err("No data to write"));
        // todo - also check if app_table starts with system app names
      } else if (permission_restore) {
        if (req.session.logged_in_as_admin) {
          cb(null)
        } else {
          cb(app_auth("need to be admin to restore records"))
        }
      } else if (helpers.is_system_app(options.app_name)) {
        cb(helpers.invalid_data("app table not allowed: "+req.params.app_table, "app_handler", exports.version, "restore_record"));
      } else {
        cb(null);
      }
    },
    // 3. get app config
    function (cb) {
      file_handler.async_app_config(options.app_name, req.freezr_environment,cb);
    },
    // ... and make sure write object conforms to the model
    function (got_app_config, cb) {
      app_config = got_app_config;
      data_model= (app_config && app_config.collections && app_config.collections[appcollowner.collection_name])? app_config.collections[appcollowner.collection_name]: null;

      if (!newObjectFieldNamesAreValid(write, data_model, {update:is_update})) {
        cb(app_err("invalid field names"));
      } else if (appcollowner.collection_name && !collectionIsValid(appcollowner.collection_name,app_config,false)){
        cb(app_err("Collection name "+appcollowner.collection_name+"is invalid."));
      } else if (!data_object_id && !is_update) { // Simple create object with no id
        cb(null, null);
      }  else if (data_object_id) { // is_upsert or update
        db_handler.read_by_id (req.freezr_environment, appcollowner, data_object_id, function(err, results) {
          cb(err, results)
        })
      } else {
        cb(app_err("Malformed path body combo "+JSON.stringify( appcollowner)));
      }
    },

    // 4. write
    function (results, cb) {
      if (results &&  is_update && results._date_created /*ie is non empty record*/)  {
        db_handler.update (req.freezr_environment, appcollowner, data_object_id, write,{old_entity:results}, cb)
      } else if (results && !is_update) { // should have gotten results
        cb(app_err("Existing record found when this should not be an update ") );
      } else if (is_update) { // should have gotten results
        cb(app_err("record not found for an update restore") );
      } else { // new document - should not have gotten results
        if (write._id) delete wrtie._id
        db_handler.create(req.freezr_environment, appcollowner, data_object_id, write, {restore_record: true}, cb)
      }
    }
    ],
    function (err, write_confirm) {
      //onsole.log("write err",err,"write_confirm",write_confirm)
      if (err) {
        helpers.send_failure(res, err, "app_handler", exports.version, "restore_record");
      } else if (!write_confirm ){
        helpers.send_failure(res, new Error("unknown write error"), "app_handler", exports.version, "restore_record");
      } else if (is_update){
        helpers.send_success(res, write_confirm);
      } else {
        ({_id, _date_created, _date_modified} = write_confirm.entity)
        helpers.send_success(res, {_id, _date_created, _date_modified});
      }
    });
}

exports.getFileToken = exports.read_record_by_id
let FILE_TOKEN_CACHE = {}
const FILE_TOKEN_EXPIRY = 24 * 3600 * 1000 // expiry of 24 hours
const FILE_TOKEN_KEEP = 18 * 3600 * 1000 // time before a new token is issued so it stays valid
let clean_filecache_timer = null
const getOrSetFileToken = function(user_id,requestee_app,data_object_id) {
  let key = FileTokenkeyFromRecord(requestee_app,data_object_id)
  let nowTime = new Date().getTime();
  if (clean_filecache_timer) clearTimeout(clean_filecache_timer);
  clean_filecache_timer = setTimeout(cleanFileTokens,10*1000);
  if (!FILE_TOKEN_CACHE[key]) {
    FILE_TOKEN_CACHE[key] = {}
    let newtoken = helpers.randomText(20)
    FILE_TOKEN_CACHE[key][newtoken]=nowTime
    return newtoken
  } else {
    let gotToken = null
    for (let [aToken, aDate] of Object.entries(FILE_TOKEN_CACHE[key])) {
      if (nowTime - aDate <  FILE_TOKEN_KEEP) gotToken = aToken
      if (nowTime - aDate > FILE_TOKEN_EXPIRY) delete FILE_TOKEN_CACHE[key][aToken]
    }
    if (gotToken) {
      return gotToken
    } else {
      let newtoken = helpers.randomText(20)
      FILE_TOKEN_CACHE[key][newtoken]=nowTime
      return newtoken
    }
  }
}
const FileTokenkeyFromRecord = function(requestee_app,data_object_id) {
  return requestee_app +"/"+ data_object_id
}
const cleanFileTokens = function(){
  //onsole.log("cleanFileTokens ")
  let nowTime = new Date().getTime();
  for (let [key, keyObj] of Object.entries(FILE_TOKEN_CACHE)) {
    for (let [aToken, aDate] of Object.entries(keyObj)) {
      if (nowTime - aDate > FILE_TOKEN_EXPIRY) {delete FILE_TOKEN_CACHE[key][aToken]}
    }
    if (Object.keys(keyObj).length == 0) delete FILE_TOKEN_CACHE[key]
  }
}
exports.sendUserFile = function (req , res){
  // /v1/userfiles/info.freezr.demo.clickOnCheese4.YourCheese/salman/logo.1.png?fileToken=Kn8DkrfgMUwCaVCMkKZa&permission_name=self
  let parts = req.path.split('/').slice(3)
  let key = decodeURI(parts.join('/'))
  let newpath = "userfiles/"+parts[1]+"/"+parts[0]+"/"+decodeURI(parts[2])
  if (!FILE_TOKEN_CACHE[key] || !FILE_TOKEN_CACHE[key][req.query.fileToken] || (new Date().getTime - FILE_TOKEN_CACHE[key][req.query.fileToken] >FILE_TOKEN_EXPIRY)) {
    if (!FILE_TOKEN_CACHE[key] ) {
      //onsole.warn("NO KEY", req.url)
    } // , FILE_TOKEN_CACHE
    //if ( !FILE_TOKEN_CACHE[key][req.query.fileToken]  ) //onsole.warn("NO TOKEN ",req.query.fileToken,"cache is ",FILE_TOKEN_CACHE[key])
    //if ((new Date().getTime - FILE_TOKEN_CACHE[key][req.query.fileToken] >FILE_TOKEN_EXPIRY)) //onsole.warn("EXPIRED TOKEN")
    res.sendStatus(401);
  } else {
    file_handler.sendUserFile(res, newpath, req.freezr_environment );
  }
}


// permission access operations
exports.setObjectAccess = function (req, res) {
  // After app-permission has been given, this sets or updates permission to access a record
  //app.put('/v1/permissions/setobjectaccess/:requestor_app/:permission_name', userLoggedInRights, app_handler.setObjectAccess);

  //'action': 'grant' or 'deny' // default is grant
  //'data_object_id' (a string) or 'query_criteria' (an object with creteria for search) mandaory
  // can have one of:  'shared_with_group':'logged_in' or 'self' or 'public'
  // 'requestee_app': app_name (defaults to self)
  // 'pubDate' -
  // 'pid' - public id to be used
  // todo this could be merged with setFieldAccess
  // note "granted" in accessible-object is redundant - should be set to false if all groups have been removed

  let app_config,
    user_id,
      appcollowner,
      permission_model,
      permission_type,
      requestee_app_table,
      accessibles_object_id,
      permission_collection,
      search_words = [],
      the_one_public_data_object = [],
      records_changed=0;
      real_object_id=null;

  const ACCESSIBLES_APPCOLLOWNER = {
          app_name:'info.freezr.admin',
          collection_name:"accessibles",
          owner:'fradmin'
        }

  //onsole.log("req.body",req.body)
  console.warn("Need to change setObjectAccess to deal with ap_table rather than app and collection names")

  var data_object_id = req.body.data_object_id? req.body.data_object_id : null;
  var query_criteria = req.body.query_criteria? req.body.query_criteria : null;
  if (req.body.object_id_list && req.body.object_id_list.length>0) {
      var theOrs = []
      req.body.object_id_list.forEach((anId) => theOrs.push({'_id':anId}))
      query_criteria = {'$or':theOrs}
  }
  var new_shared_with_user = req.body.shared_with_user? req.body.shared_with_user: null;
  var new_shared_with_group = new_shared_with_user? "user": (req.body.shared_with_group? req.body.shared_with_group: 'self');
  var issues = [];
  var doGrant = (!req.body.action || req.body.action == "grant")? true:false;
  var date_Published = doGrant? (req.body.pubDate? req.body.pubDate : new Date().getTime()):null;

  var addToAccessibles =  new_shared_with_group == "public"  && !req.body.not_accessible;
  // currently added query_criteria to deal with multuple items, but "make_accessible" section only works with one object at a time - to be fixed / updated later (Todo later)

  helpers.log(req,"setObjectAccess by "+req.session.logged_in_user_id+" for "+data_object_id+" query:"+ JSON.stringify(query_criteria)+" action"+JSON.stringify(req.body.action)+" perm: " +req.params.permission_name);

  function app_err(message) {return helpers.app_data_error(exports.version, "write_record", req.params.requestor_app + "- "+message);}

  async.waterfall([
    // 0 get app config
    function (cb) {
        file_handler.async_app_config(req.params.requestor_app, req.freezr_environment,cb);
    },
    // 1. Check all data needed exists
    function (the_app_config, cb) {
        app_config = the_app_config;

        permission_model= (app_config && app_config.permissions && app_config.permissions[req.params.permission_name])? app_config.permissions[req.params.permission_name]: null;

        if (!app_config){
            cb(app_err("Missing app_config"));
        } else if (!permission_model){
            cb(app_err("Missing permission"));
        } else if ( permission_model.sharable_group != new_shared_with_group) {
            cb(app_err("permission group requested is not permitted "+new_shared_with_group));
        } else if (helpers.permitted_types.groups_for_objects.indexOf(new_shared_with_group)<0 ){
            cb(app_err("invalid permission group"));
        } else if (!data_object_id && !query_criteria){
            cb(app_err("Missing data_object_id or query_criteria"));
        } else if (data_object_id && typeof data_object_id!="string"){
            cb(app_err("data_object_id must be a string"));
        } else if (query_criteria && typeof query_criteria!="object"){
            cb(app_err("query_criteria must be an object"));
        } else if (!req.body.action){
            cb(app_err("Missing action (grant or deny)"));
        } else if (req.body.action && ["grant","deny"].indexOf(req.body.action)<0 ){
            cb(app_err("invalid field permission action :"+req.body.action));
        } else {
          requestee_app_table = permission_model.requestee_app_table || req.params.requestor_app + (permission_model.collection_name?("."+permission_model.collection_name):"");
          permission_type = permission_model.type;
          if (!permission_type){
            cb(app_err("Missing permission type"));
          } else if (permission_type !="object_delegate") {
            cb(app_err("Only allowed permission type is object_delegate. Please review app_config"));
          } else {
            cb(null);
          }
        }
    },

    // 1. check app token
    function (cb) {
      let checks = {requestor_app:req.params.requestor_app}
      db_handler.check_app_token_and_params(req, checks, cb)
    },

    // 3. get app permissions
    function( the_user, app_name, logged_in, cb) {
      user_id = the_user
      accessibles_object_id = req.body.publicid || user_id+"/"+requestee_app_table+"/"+data_object_id;

      db_handler.permission_by_owner_and_permissionName (req.freezr_environment, user_id, req.params.requestor_app, requestee_app_table, req.params.permission_name, cb)
    },

    // 4. check permission is granted and can authorize requested fields, and if so, get permission collection
    // 5. open object by id
    function (results, cb) {
      if (!results || results.length==0) {
          cb(helpers.error("PermissionMissing","permission does not exist"))
      }  else if (!results[0].granted) {
          cb(helpers.error("PermissionNotGranted","permission not granted yet"))
      } else {
          appcollowner = {
            app_table:requestee_app_table,
            collection_name:null,
            owner:user_id
          }
          //onsole.log("querying at setObjectAccess ",data_object_id,query_criteria)
          db_handler.query(req.freezr_environment, appcollowner,
            (data_object_id? data_object_id : query_criteria),
            {},cb)
      }
    },


    // 6. If object exists, continue and write _
    function (results, cb) {
        if (results == null || results.length == 0) {
            cb(helpers.missing_data("no such objects found"))
        } else if (addToAccessibles && results.length>1){
            cb(app_err("internal error - cannot set more than object as accessible"));
        } else {
            async.forEach(results, function (data_object, cb2) {
                //onsole.log("SETTING ACCESS TO ",(doGrant?"Pub":"NOPUB"),data_object._id,data_object)
                if (addToAccessibles && permission_model.search_fields) {
                    search_words = helpers.getUniqueWords(data_object,permission_model.search_fields)
                }

                // nb this part only works ith one - to fix

                if (new_shared_with_group == "public") the_one_public_data_object.push(data_object);

                // set _accessible_By field
                var accessibles = data_object._accessible_By? data_object._accessible_By:{groups:[],users:[], group_perms:{}, user_perms:{}};
                // _accessible_By: {groups: ['public'], users:[], group_perms:{"public":["requestor_app1/perm1","requestor_app1/perm2"], user_perms:{someone:["requestor_app3/perm2"]} }
                if (doGrant) {
                    if (accessibles.groups.indexOf(new_shared_with_group)<0 ) accessibles.groups.push(new_shared_with_group);
                    if (new_shared_with_group=="user") {
                        if (accessibles.users.indexOf(new_shared_with_user)<0 ) accessibles.users.push(new_shared_with_user);
                        if (!accessibles.user_perms[new_shared_with_user]) accessibles.user_perms[new_shared_with_user]=[];
                        if ( accessibles.user_perms[new_shared_with_user].indexOf(req.params.requestor_app+"/"+req.params.permission_name)<0) accessibles.user_perms[new_shared_with_user].push((req.params.requestor_app+"/"+req.params.permission_name));
                    } else {
                        if (!accessibles.group_perms[new_shared_with_group]) accessibles.group_perms[new_shared_with_group]=[];
                        if ( accessibles.group_perms[new_shared_with_group].indexOf(req.params.requestor_app+"/"+req.params.permission_name)<0) accessibles.group_perms[new_shared_with_group].push((req.params.requestor_app+"/"+req.params.permission_name));
                    }
                } else { // remove grant
                    if (new_shared_with_group=="user") {
                        var permIndex = accessibles.user_perms[new_shared_with_user]? accessibles.user_perms[new_shared_with_user].indexOf(req.params.requestor_app+"/"+req.params.permission_name): (-1);
                        if ( permIndex>-1) accessibles.user_perms[new_shared_with_user].splice(permIndex,1);
                        if (accessibles.user_perms[new_shared_with_user] && accessibles.user_perms[new_shared_with_user].length>0) {
                            issues.push("Object is still accessible by other users or groups as other permissions have granted it access.")
                        } else {
                            delete accessibles.user_perms[new_shared_with_user];
                            var usrIndex = accessibles.users.indexOf(new_shared_with_user);
                            accessibles.users.splice(usrIndex,1)
                            // todo should also remove "user" from "groups" if there are no more users in user_perms
                        }
                    } else { // shared_with_group
                        if ((accessibles.group_perms[new_shared_with_group])){
                            var permIndex = accessibles.group_perms[new_shared_with_group].indexOf(req.params.requestor_app+"/"+req.params.permission_name);
                            if ( permIndex>-1) accessibles.group_perms[new_shared_with_group].splice(permIndex,1);
                        } else {
                            issues.push("Record had not been marked to me permissable, possibly due to a previous error.")
                        }
                        if (accessibles.group_perms[new_shared_with_group] && accessibles.group_perms[new_shared_with_group].length>0) {
                            issues.push("Object is still accessible by other groups as other permissions have granted it access.")
                        } else {
                            delete accessibles.group_perms[new_shared_with_group];
                            var grpIndex = accessibles.groups.indexOf(new_shared_with_group);
                            accessibles.groups.splice(grpIndex,1)
                        }
                    }
                }

                // add _pubishdate if it exists

                // note purposefully hardoded so only these changes will be accepted in db_handler: _accessible_By, _publicid, _date_published
                var changes = {_accessible_By:accessibles}
                if (addToAccessibles) changes._publicid = (doGrant? accessibles_object_id: null);
                changes._date_published = date_Published;
                records_changed++
                db_handler.update (req.freezr_environment, appcollowner, (data_object._id+""), changes,{replaceAllFields:false, newSystemParams:true, old_entity:data_object /*not needed by momngo but may be useful for other db's*/}, cb)

              },
              function (err) {
                  if (err) {
                      console.warn("COULD NOT SET OBJECT ACCESS IN QUERY "+JSON.stringify(err))
                  }
                  cb(err)
              }
          )
        }
    },

    //7 get accessible_objects and write to it
    function (results, cb) {
      if (addToAccessibles && the_one_public_data_object.length>1) {
          cb(app_err("Cannot set multiple records to accessible. Feature to be created later."));
          console.warn(the_one_public_data_object)
      } else if (addToAccessibles) {
        //onsole.log("7 find "+req.session.logged_in_user_id+" for "+data_object_id+ " accessibles_object_id:"+accessibles_object_id)

        db_handler.query(req.freezr_environment, ACCESSIBLES_APPCOLLOWNER, {"data_owner":user_id,"data_object_id":data_object_id}, {}, cb)

      } else {cb(null, null)}
    },
    // 8. write or update the results
    function (results, cb) {
      //onsole.log("results",results)
        if (addToAccessibles) {
            if (results == null || results.length == 0) {
                //  accessibles_object_id automated version is user_id+"/"+requestee_app_table+"/"+"/"+data_object_id;
                var accessibles_object = {
                    'requestee_app_table':requestee_app_table,
                    'requestee_app': req.params.requestor_app,
                    'data_owner':user_id,
                    'data_object_id': data_object_id,
                    'permission_name':req.params.permission_name,
                    'requestor_app':req.params.requestor_app,
                    'shared_with_group':[new_shared_with_group],
                    'shared_with_user':[new_shared_with_user],
                    '_date_published' :date_Published,
                    'data_object' : the_one_public_data_object[0], // make this async and go through al of them
                    'search_words' : search_words,
                    'granted':doGrant,

                    '_id':accessibles_object_id
                    }
                if (!doGrant) {
                    app_err("cannot remove a permission that doesnt exist");
                    cb(null, null); // Internal error which can be ignored as non-existant permission was being removed
                } else { // write new permission
                    db_handler.create (req.freezr_environment, ACCESSIBLES_APPCOLLOWNER, null, accessibles_object, {keepReservedFields:true}, cb)
                }
            } else if (results.length >1) {
              helpers.state_error( "app_handler", exports.version, "setObjectAccess","multiple_permissions", new Error("Retrieved mkroe than one permission where there should only be one "+JSON.stringify(results)), null)
              // todo delete other ones?
            } else  { // update existing perm
                var write = {};
                /* jan 2020 remvoed these - redundant? recheck
                if (results[0].granted && results[0].data_object && results[0].data_object. owner != user_id) {
                    cb(app_err("Cannot overwrite an existing accessible object - other user"));
                } else if (results[0].granted && results[0].requestor_app != req.params.requestor_app){
                    cb(app_err("Cannot overwrite an existing accessible object - other app"));
                } else if (results[0].granted && results[0].data_object_id != data_object_id){
                    cb(app_err("Cannot overwrite an existing accessible object - other app"));
                }
                */
                // todo - flag if regranting...
                if (doGrant) {
                    write.granted=true;
                    write.shared_with_group = helpers.addToListAsUnique(results[0].shared_with_group,new_shared_with_group);
                    if (new_shared_with_group=="user") write.shared_with_user = helpers.addToListAsUnique(results[0].shared_with_user,new_shared_with_user);
                } else if (!doGrant) {
                    if (new_shared_with_group=="user" && results[0].shared_with_user.indexOf(new_shared_with_user)>-1)
                    if ( (new_shared_with_group=="user" && (!results[0].shared_with_user || results[0].shared_with_user.length==0 ) && results[0].indexOf("user")>-1)
                        || results[0].indexOf(new_shared_with_group)>-1) {
                        write.shared_with_group = results[0].shared_with_group;
                        write.shared_with_group.splice(results[0].indexOf(new_shared_with_group),1);
                    }
                    write.granted = ( (write.shared_with_group && write.shared_with_group.length>0) ) ;
                }
                // to review why this was repeted - update now should handle just the changes. Any reason to redo all?
                write._date_published = date_Published;
                write.data_object = the_one_public_data_object[0];
                write.search_words = search_words;
                //console.log("todo - Need to review setPermissions")
                write.requestee_app_table = requestee_app_table;  // in case of re-use of another object??
                write.permission_name = req.params.permission_name;  // in case of re-use of another object??
                write.requestor_app = req.params.requestor_app; // in case of re-use of another object??
                db_handler.update (req.freezr_environment, ACCESSIBLES_APPCOLLOWNER, accessibles_object_id, write,{replaceAllFields:false, old_entity:results[0], newSystemParams:true, newSystemParams:true}, cb)
            }
        } else {cb(null, null)}
    },

    // 10 Add accessible id back to object
    function(results, cb) {
      if (addToAccessibles) {
        the_one_public_data_object[0]._publicid = doGrant? accessibles_object_id: null;
        db_handler.update (req.freezr_environment, appcollowner, data_object_id, the_one_public_data_object[0],{replaceAllFields:true, old_entity:the_one_public_data_object[0]}, cb)
      } else {cb(null, null)}
    }
  ],
  function (err, results) {
      if (err) {
          console.warn(err)
          helpers.send_failure(res, err, "app_handler", exports.version, "setObjectAccess");
      } else if (addToAccessibles) { // sending back data_object_id
          helpers.send_success(res, {"data_object_id":the_one_public_data_object[0]._id, "_publicid": (doGrant? accessibles_object_id: null),'accessibles_object_id':accessibles_object_id, '_date_published':date_Published, 'grant':doGrant,'issues':issues, 'query_criteria':query_criteria, 'records_changed':records_changed});
      } else { // sending back data_object_id
          helpers.send_success(res, {"data_object_id":data_object_id, 'grant':doGrant,'issues':issues, 'query_criteria':query_criteria, 'records_changed':records_changed});
      }
  });
}

// developer utilities
    exports.getConfig = function (req, res){
        //app.get(''/v1/developer/config/:app_name'

        var app_config, collection_names = null;

        function app_err(message) {return helpers.app_data_error(exports.version, "getConfig", req.params.app_name + " - " + message);}

        async.waterfall([
            // 0. get app config
            function (cb) {
                file_handler.async_app_config(req.params.app_name, req.freezr_environment,cb);
            },
            // 1. make sure all data exits
            function (got_app_config, cb) {
                app_config = got_app_config;
                if (!req.session.logged_in_user_id) {
                    cb(helpers.auth_failure("app_handler", exports.version, "getConfig", req.params.app_name +  " Need to be logged in to access app"));
                } else {
                    cb(null);
                }
            },

            // 2. check app token
            function (cb) {
              let checks = {user_id: req.session.user_id, logged_in:true, requestor_app:[req.params.app_name,"info.freezr.account"]}
              db_handler.check_app_token_and_params(req, checks, cb)
            },

            // 3. open database connection & get collections
            function (the_user, app_name, logged_in, cb) {
              //onsole.log("getcoll ",req.params.app_name,req.session.logged_in_as_admin)
              if (req.params.app_name=="info.freezr.admin" && req.session.logged_in_as_admin) the_user = 'fradmin'
              db_handler.getAllCollectionNames(req.freezr_environment, the_user, req.params.app_name, cb);
            },

            // 4. keep names
            function (names, cb) {
              collection_names = names;
              cb(null)
            },

        ],
        function (err) {
          console.warn(err)
            if (err) {
                helpers.send_failure(res, err, "app_handler", exports.version, "getConfig");
            } else {
                helpers.send_success(res, {'app_config':app_config, 'collection_names':collection_names});
            }
        });
    }
    exports.updateFileList = function (req, res){
        //app.get('/v1/developer/fileListUpdate/:app_name/:source_app_code/:folder_name', userDataAccessRights, app_hdlr.updateFileList);
        // Note: Currently ignores files within directories - ie doesnt iterate
        // todo - note - functionality not tested

        console.log("=======================================")
        console.log("updateFileList NEEDS TO BE REDONE!!!!!")
        console.log("=======================================")

        //onsole.log("got to updateFileDb request for body"+JSON.stringify(req.body));

        /*

        var app_config = file_handler.get app config(req.params.app_name);
        var flags = new Flags({'app_name':req.params.app_name}, {'collection_name':'files'});

        var collection_name = "files";
        var data_model = (app_config && app_config.files)? app_config.files: null;

        var dbCollection = null, warning_list =[], files_added_list = [];

        function app_err(message) {return helpers.app_data_error(exports.version, "updateFileList", req.params.app_name, message);}

        async.waterfall([
            // 1. make sure all data exits
            function (cb) {
                if (!req.session.logged_in_user_id) {
                    cb(helpers.auth_failure("app_handler", exports.version, "updateFileList", req.params.app_name, "Need to be logged in to access app"));
                } else if (!collectionIsValid(collection_name, app_config, true)) {
                    cb(app_err("invalid collection name"));
                } else if (!newObjectFieldNamesAreValid(null,data_model)) {
                    cb(app_err("cannot update file list with required field_names"));
                } else if (data_model && data_model.do_not_allow) {
                    cb(app_err("files not allowed"));
                } else if (!file_handler.valid_path_extension(req.params.folder_name)) {
                    cb(app_err("invalid folder name", ""));
                } else {
                    cb(null);
                }
            },

            // 1. check app token
            function (cb) {
              let checks = {user_id: req.session.user_id, logged_in:true, requestor_app:"info.freezr.account"}
              db_handler.check_app_token_and_params(req, checks, cb)
            },

            // 3. open database connection & get collection
            function (cb) {
                db_handler.app_db_collection_get(req.params.app_name.replace(/\./g,"_") , collection_name, cb);
            },

            // 4. read files
            function (theCollection, cb) {
                dbCollection = theCollection;
                file_handler.readUserDir(req.session.logged_in_user_id,req.params.app_name,req.params.folder_name, req.freezr_environment, cb);
            },


            // 5. handle file and get a unique id
            function(folderlist, cb) {
                if (folderlist && folderlist.length>0) {
                    var file_name;
                    async.forEach(folderlist, function (file_name, cb2) {

                        var data_object_id = req.session.logged_in_user_id+(req.params.folder_name?file_handler.sep()+req.params.folder_name:"")+file_handler.sep()+file_name;

                        if (!helpers.valid_filename(file_name) ) {
                            warning_list.push(file_name+": invalid file name");
                            cb2(null);
                        } else if (data_model && data_model.files.... // add .files ... allowed_file_types && data_model.allowed_file_types.length>0 && data_model.allowed_file_types.indexOf(file_handler.fileExt(file_name))<0 ){
                            warning_list.push(file_name+": invalid file type");
                            cb2(null);
                        } else {

                            async.waterfall([
                                function (cb3) {
                                    file_handler.userLocalFileStats(req.session.logged_in_user_id,req.params.app_name,req.params.folder_name, file_name, cb3);

                                },

                                function(fileStats, cb3) {
                                    if (fileStats.isDirectory() ) {
                                        cb3(helpers.app_data_error(exports.version, "updateFileList", req.params.app_name, "directory error exception - file is a directory"));
                                    } else {
                                        cb3(null)
                                    }
                                },

                                function (cb3) {
                                    dbCollection.find({ _id: data_object_id }).toArray(cb3);
                                },

                                // 7. write or update the results
                                function (results, cb3) {
                                    if (!results  || results.length == 0) {
                                        var write = {};
                                        write._date_modified = new Date().getTime();
                                        write._id = data_object_id;
                                        write._folder = req.params.folder_name? req.params.folder_name:file_handler.sep();
                                        write._date_created = new Date().getTime();
                                        dbCollection.insert(write, { w: 1, safe: true }, cb3);
                                    } else if (results.length > 1) {
                                        cb3(helpers.app_data_error(exports.version, "updateFileList", req.params.app_name, "multiple_files_exception - Multiple Objects retrieved for "+file_name))
                                    } else {
                                        cb3(null, null);
                                    }
                                },

                                function (written_object, cb3) {
                                    if (written_object) files_added_list.push(file_name); // else done with file: file_name
                                    cb3(null);
                                }
                            ],
                            function (err) { // end cb3 - back to cb2
                                if (err) {
                                    warning_list.push(file_name+": "+(err.message? err.message:"unknown error"));
                                }
                                cb2(null);
                            });
                        }
                    },
                    function (err) {
                        if (err) {
                            warning_list.push("'unkown_file_error': "+JSON.stringify(err));
                        }
                        cb(null)
                    }

                    )
                } else {
                    cb(null);
                }
            },

        ],
        function (err) {
            if (err) {
                helpers.send_failure(res, err, "app_handler", exports.version, "updateFileList");
            } else {
                helpers.send_success(res, {'flags':flags, 'files_added_list':files_added_list, 'warning_list':warning_list});
            }
        });*/
    }

// ancillary functions and name checks
  const app_and_coll_names_from_app_table = function(app_table, app_name) {
    let collection_name=null, table_app_name=null, own_collection=false;
    if (helpers.startsWith(app_table, app_name+".")) {
      own_collection=true;
      table_app_name = app_name;
      collection_name = app_table.slice(app_name.length+1)
    } else if (helpers.startsWith(app_table, app_name) && app_table.length==app_name.length ) {
      table_app_name = app_name;
      own_collection=true;
    } else {
      table_app_name = app_table;
    }
    return [table_app_name, collection_name, own_collection]
  }
  const appcoll_from_app_table = function(app_table, requestor_app) {
    let appcoll={
      app_table:app_table,
      collection_name:null,
      own_collection:false
    }
    if (helpers.startsWith(app_table, requestor_app+".")) {
      appcoll.own_collection=true;
      appcoll.app_name = requestor_app;
      //appcoll.app_table = requestor_app;
      //appcoll.collection_name = app_table.slice(requestor_app.length+1)
    } else if (helpers.startsWith(app_table, requestor_app) && app_table.length==requestor_app.length ) {
      appcoll.app_name = requestor_app;
      appcoll.own_collection=true;
    } else {
      appcoll.app_name = app_table;
    }
    return appcoll;
  }
    var collectionIsValid = function (collection_name, app_config,is_file_record){
        // checkes collection name and versus app_config requirements

        if (!helpers.valid_collection_name(collection_name,is_file_record) ) {
            return false
        } else if (!app_config || !app_config.meta || !app_config.meta.only_use_collections_listed) {
            return true;
        } else if (is_file_record || collection_name=="files" ){
            return !(app_config.files && app_config.files.do_not_allow)
        } else if (app_config.collections) {
           for (oneCollection in app_config.collections) {
                if (app_config.collections.hasOwnProperty(oneCollection) && oneCollection == collection_name) {return true;}
            }
        }
        return false;
    }
    var newObjectFieldNamesAreValid = function(write, data_model, options = {update:false}) {
        // Make lists of required field_names from data object
        if (!data_model) {
            return true;
        } else {
            var allFieldNameList= [],
                requiredFieldNameList = [];
            if (data_model && data_model.field_names) {
                for (field_name in data_model.field_names) {
                    if (data_model.field_names.hasOwnProperty(field_name)) {
                        allFieldNameList.push(field_name);
                        if (data_model.field_names[field_name].required) requiredFieldNameList.push(field_name)
                    }
                }
            }
            //onsole.log("allFieldNameList are "+allFieldNameList.join(", "));
            //onsole.log("requiredFieldNameList are "+requiredFieldNameList.join();

            if (write) {
                for (key in write) {
                    if (write.hasOwnProperty(key)) {
                        if (requiredFieldNameList.indexOf(key)>-1) {
                            requiredFieldNameList.splice(requiredFieldNameList.indexOf(key),1)
                        }
                        if (data_model && data_model.strictly_Adhere_To_schema && allFieldNameList.indexOf(key)<0) {
                            helpers.warning("app_handler", exports.version, "newObjectFieldNamesAreValid","data schema was declared as strict but "+key+" is not declared");
                            return false
                        }
                    }
                }
            }

            return (options.update || requiredFieldNameList.length==0);
        }
    }
    var removeIds = function(jsonList) {
        // toto later: in config add a var: private or dontReturn which means that is not returned to third parties
        for (var i=0; i<jsonList.length;i++) {
            if (jsonList[i]._id) {
                delete jsonList[i]._id;
            }
        }
        return jsonList;
    }
    var unique_id_from = function(ref_field_names, params, user_id) {
        data_object_id= "";
        for (var i=0; i<ref_field_names.length; i++) {
            if (!params[ref_field_names[i]] || params[ref_field_names[i]]=="") {
                return helpers.app_data_error(exports.version, "unique_id_from", "app name uknown","missing data key needed for making unique id: "+ref_field_names[i]);
            }
            data_object_id = "_"+params[ref_field_names[i]];
        }
        return user_id + data_object_id;
    }
    var folder_name_from_id = function(the_user, the_id) {
        return the_id.replace((the_user+"_"),"");
    }



// NOT USED / EXTRA
    var make_sure_required_field_names_exist = function (params, data_model, cb) {
        // NOTE - Currently not used... can be used if want to have records point to other records... can be put in write_record
        // checks the data model to see if there are requried referecne objects and make sure the refeenced objects actually exist
        // todo - Works with ONE ref object... need to expand it to multiple
        var ref_names = [];
        if (data_model && data_model.field_names) {
            for (key in data_model.field_names) {
                if (data_model.field_names.hasOwnProperty(key) && data_model.field_names[key].type=="data_object") {
                    ref_names.push(key);
                }
            }
        }
        if (ref_names.length == 0) {
            cb(null);
        } else {
            // TODO Need to loop through multiple references
            a_ref_name = ref_names[0];
            referenced_object_name = data_model.field_names[a_ref_name].referenced_object;
            ref_value = params[a_ref_name];

            db.collection(referenced_object_name, function(err, referenced_object){
                if (err) {
                    cb(helpers.app_data_error(exports.version, "make_sure_required_field_names_exist", "app name uknown","Could not get referenced object "+referenced_object_name+"from "+a_ref_name,""))
                } else {
                    referenced_object.find({ _id: ref_value }).toArray(function (err, results) {
                        if (err) {
                            cb(err);
                        } else if (results.length == 0) {
                            cb(helpers.app_data_error(exports.version, "make_sure_required_field_names_exist", "app name uknown","referenced object "+ref_value+" in collection "+referenced_object_name+" from key id "+a_ref_name));
                        } else if (results.length == 1) {
                            cb(null);
                        } else {
                            cb(helpers.app_data_error(exports.version, "make_sure_required_field_names_exist", "app name uknown","More than one result retuened for referenced object "+referenced_object_name+"from "+a_ref_name,""));
                        }
                    });
                }
            } );

        }
    }
