// freezr.info - nodejs system files - app_handler.js
exports.version = "0.0.133";

var helpers = require('./helpers.js'),
    db_handler = require("./db_handler.js"),
    user_obj = require("./user_obj.js"),
    async = require('async'),
    file_handler = require('./file_handler.js');

const DEFAULT_COLLECTION_NAME = "main" // if name is not specified

exports.generateSystemDataPage = function (req, res) {
    // '/allmydata/:whattodo/:app_name'
    if (req.params.whattodo == "view" ) {
        req.params.sysConfig = {
            'pages':{
                'allmydata_view': {
                    "page_title":"View all my data for "+req.params.app_name,
                    "html_file":"./info.freezr.account/allmydata_view.html",
                    "css_files": ["./info.freezr.account/allmydata_view.css"],
                    "script_files": ["./info.freezr.account/allmydata_view.js","./info.freezr.account/FileSaver.js"]
                }
        }}
       req.params.page = 'allmydata_view'
    } else if (req.params.whattodo == "backup" ) {
        req.params.sysConfig = {
            'pages':{
                'allmydata_backup': {
                    "page_title":"Backup and Restore data for "+req.params.app_name,
                    "html_file":"./info.freezr.account/allmydata_backup.html",
                    "css_files": ["./info.freezr.account/allmydata_backup.css"],
                    "script_files": ["./info.freezr.account/allmydata_backup.js","./info.freezr.account/FileSaver.js"]
                }
        }}
        req.params.page = 'allmydata_backup'
    } else {
        helpers.send_internal_err_page(res, "app_handler", exports.version, "generateDataPage", "whattodo is not defined");
    }

    exports.generatePage(req, res);
}

exports.generatePage = function (req, res) {
    // '/apps/:app_name' and '/apps/:app_name/:page' (and generateDataPage above)
    helpers.log (req,"appPage: "+req.url);

    if (req.params.sysConfig === undefined) {
        file_handler.async_app_config(req.params.app_name, req.freezr_environment, function(err, app_config){
            if (err) {
                helpers.warning("app_handler.js", exports.version, "generatePage", "Pass through of app_config ");
                helpers.send_failure(res, 500, err);
            } else {
                var page_name = req.params.page? req.params.page: "index";
                var has_app_config = true;
                if (!app_config) {
                    app_config = {pages:{}};
                    has_app_config = false;
                }
                app_config.pages = app_config.pages || {};
                app_config.pages[page_name] = app_config.pages[page_name] || {}

                if (app_config.pages[page_name].initial_query) {
                    // formulate req to add an internlcallforward and relevant query_params
                    // generatePageWithAppConfig (req, res, app_config, initial_query) addinitial data here and internalcallfwd it from db_quer
                            // note define requestee app and requestor app etc to fit db_query params without overlapping

                    // Only takes type: db_query at this time

                    var data_params = app_config.pages[page_name].initial_query;

                    req.params.requestor_app = req.params.app_name;
                    req.params.permission_name = data_params.permission_name;
                    var app_config_permission_schema = (app_config.permissions)? app_config.permissions[req.params.permission_name]: {};
                    if (app_config_permission_schema) {
                        req.params.requestee_app = (app_config_permission_schema.requestee_app)? app_config_permission_schema.requestee_app: req.params.requestor_app;
                        if (data_params.collection_name) {
                            if (app_config_permission_schema.collection) {
                                req.body.collection = app_config_permission_schema.collection;
                                if (data_params.collection_name && app_config_permission_schema.collection != data_params.collection_name) helpers.warning("app_handler", exports.version, "generatePage", "permission schema collections inconsistent with requested collction "+data_params.collection_name+" for app: "+req.params.app_name)
                            } else if (app_config_permission_schema.collections && Object.prototype.toString.call( app_config_permission_schema.collections ) === '[object Array]' && app_config_permission_schema.collections.length>0) {
                                if (data_params.collection_name && app_config_permission_schema.collections.indexOf(data_params.collection_name)>0) {
                                    req.body.collection = data_params.collection_name;
                                } else {
                                    helpers.send_failure(res, 500, helpers.state_error("app_handler", exports.version, "generatePage","bad_colelction_name","permission schema collections inconsistent with requested collction "+data_params.collection_name+" for app: "+req.params.app_name));
                                }
                            } else {
                                helpers.send_failure(res, 500, helpers.state_error("app_handler", exports.version, "generatePage","bad_colelction_name","permission schema collections not stated - need to add to app config:  "+data_params.collection_name+" for app: "+req.params.app_name));
                            }
                        } else {
                            if (app_config_permission_schema.collections && Object.prototype.toString.call( app_config_permission_schema.collections ) === '[object Array]' && app_config_permission_schema.collections.length>0) {
                                req.body.collection = app_config_permission_schema.collections[0]
                            } else {
                                helpers.send_failure(res, 500, helpers.state_error("app_handler", exports.version, "generatePage","bad_colelction_name","permission schema collections not stated - need to add to app config the desired collection for  app: "+req.params.app_name));
                            }
                        }
                    } else {
                        req.params.requestee_app = req.params.requestor_app;
                        req.body.collection = data_params.collection_name || null;
                    }
                    req.header('Authorization') = 'IntReq '+results.app_token // internal query request

                    req.internalcallfwd = function (err, results) {
                        if (err) console.warn("State Error "+err)

                        req.params.queryresults = {results: results};
                        generatePageWithAppConfig(req, res, app_config);
                    }
                    exports.db_query(req, res);

                } else {
                    // todo - check if the files exist first?
                    if (!has_app_config || !app_config.pages[page_name] || !app_config.pages[page_name].page_title){
                      app_config.pages[page_name]={}
                      app_config.pages[page_name].page_title  =  page_name;
                      app_config.pages[page_name].html_file   =  page_name+".html"; // file_handler.appLocalFileExists(req.params.app_name, (page_name+".html"))?  page_name+".html" : null;
                      app_config.pages[page_name].css_files   =  page_name+".css"; // file_handler.appLocalFileExists(req.params.app_name, (page_name+".css" ))?  page_name+".css"  : null;
                      app_config.pages[page_name].script_files= [page_name+".js"] //file_handler.appLocalFileExists(req.params.app_name, (page_name+".js"  ))? [page_name+".js"]  : null;
                    }
                    generatePageWithAppConfig(req, res, app_config);
                }
            }
        })
    } else {
         generatePageWithAppConfig(req, res, req.params.sysConfig)
    }
}

var generatePageWithAppConfig = function (req, res, app_config) {
    var page_name = req.params.page? req.params.page: "index";
    if (helpers.endsWith(page_name, '.html')) page_name = page_name.slice(0,-5);

    var page_params = {};
    if (app_config && app_config.pages && app_config.pages[page_name]) {
        page_params = app_config.pages[page_name];
    }

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


    db_handler.get_or_set_app_token_for_logged_in_user (req.freezr_environment, req.session.device_code, req.session.logged_in_user_id,  req.params.app_name, function(err, results){
      //onsole.log("in generate page - get_or_set_app_token_for_logged_in_user ",results)
      if (err || !results.app_token) {
          helpers.send_internal_err_page(res, "app_handler", exports.version, "generatePage", "Could not get app token");
      } else {
        res.cookie('app_token_'+req.session.logged_in_user_id, results.app_token,{path:"/apps/"+req.params.app_name});

        //options.messages.showOnStart = (results.newCode && app_config && app_config.permissions && Object.keys(app_config.permissions).length > 0);
        // console 2019 todo mechanism for knowing app is installed for fist time and going to permissions - perhaps do after install

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

exports.write_data = function (req, res){
  // app.post('/ceps/write/:app_name/', userDataAccessRights, app_handler.cepsWriteData);
  // app.post('/ceps/write/:app_name/:collection', userDataAccessRights, app_handler.cepsWriteData);
  // app.post('/ceps/write/:app_name/:collection/:user_id', userDataAccessRights, app_handler.cepsWriteData);

  //helpers.log (req,"ceps writeData at "+req.url); //+"body:"+JSON.stringify((req.body && req.body.options)? req.body.options:" none"));
  helpers.log (req,"ceps writeData at "+req.url+"body:"+JSON.stringify((req.body && req.body.options)? req.body.options:" none"));

  // Initialize variables
  let data_object_id= (req.body.options && req.body.options.data_object_id)? req.body.options.data_object_id: null;
  let user_id;
  let write = (req.body && req.body.data)? req.body.data: {};

  // Items not yet included in CEPS -
  const restoreRecord = (req.body.options && req.body.options.restoreRecord)
  const updateRecord  = (req.body.options && (req.body.options.updateRecord || req.body.options.update))
  const upsertRecord  = (req.body.options && req.body.options.upsert)
  let fileParams = {'dir':"", 'name':"", 'duplicated_file':false};
    fileParams.is_attached = (req.file)? true:false;
    if (req.body.options && (typeof req.body.options == "string")) req.body.options = JSON.parse(req.body.options); // needed when upload file
    if (req.body.data && (typeof req.body.data == "string")) req.body.data = JSON.parse(req.body.data); // needed when upload file

  // freezr specific actions
  let app_config = null, data_model=null, appcollowner=null, returned_confirm_fields={}, final_object = null;
  let isAccessibleObject, permission_object;
  let flags = new Flags({'app_name':req.params.app_name});

  function app_err(message) {return helpers.app_data_error(exports.version, "writeData", req.params.app_name, message);}
  function app_auth(message) {return helpers.auth_failure("app_handler", exports.version, "writeData", message);}


  // inistialisation cont.
  const collection_name=req.params.collection || (fileParams.is_attached? "files" : DEFAULT_COLLECTION_NAME)

  async.waterfall([
    // 1. check app token .. and set user_id based on record if not a param...
    function (cb) {
      db_handler.check_app_token_and_params(req, {requestor_app: req.params.app_name}, cb)
    },
    function (the_user, app_name, logged_in, cb) {
        user_id = the_user
        //onsole.log("checlking device codes ..", req.session.device_code, user_id, req.params.app_name)
        cb(null)
    },
    // 2. get app config
    function (cb) {
      file_handler.async_app_config(req.params.app_name, req.freezr_environment,cb);
    },
    // ... and make sure all data exits and set data_model
    function (got_app_config, cb) {
      app_config = got_app_config;

      // set data_model
      if (fileParams.is_attached) {
        if (req.params.collection) flags.add('warnings','collectionNameWithFiles',{'collection_name':collection_name});
        if (data_object_id) flags.add('warnings','dataObjectIdSentWithFiles');
        data_model = (app_config && app_config.files)? app_config.files: null;
      } else if (req.params.collection == "files" && updateRecord){ //201909 - todo review
        data_model = (app_config && app_config.files)? app_config.files: null;
      } else {
        data_model= (app_config && app_config.collections && app_config.collections[collection_name])? app_config.collections[collection_name]: null;
      }

      // Check data exists (and allow restoreRecords exception to rules)
      if (!newObjectFieldNamesAreValid(req,data_model)) {
        cb(app_err("invalid field names"));
      } else if (fileParams.is_attached && data_model && data_model.files && data_model.files.do_not_allow) {
        cb(app_err("config doesnt allow file uploads."));
      } else if (!fileParams.is_attached && Object.keys(write).length<=0 ) {
        cb(app_err("Missing data parameters."));
      } else if (helpers.system_apps.indexOf(req.params.app_name)>-1 ||
          !collectionIsValid(collection_name,app_config,fileParams.is_attached)){
          if (collection_name=="accessible_objects" && req.params.app_name=="info.freezr.permissions" && restoreRecord && req.body.options.password) {
              db_handler.user_by_user_id(req.freezr_environment, user_id, function (err, user_json) {
                  if (err) {
                      cb(err)
                  } else if (!req.session.logged_in_as_admin){
                      cb(helpers.auth_failure("app_handler", exports.version, "write_data", req.params.app_name, "Need to be admin to restore records"));
                  } else {
                      var u = new User(user_json);
                      if (u.check_passwordSync(req.body.options.password)) {
                          cb(null)
                      } else {
                          cb(helpers.auth_failure("app_handler", exports.version, "write_data", req.params.app_name, "Cannot restore records or upload to accessible_objects without a password"));
                      }
                  }
              })
          } else if (helpers.system_apps.indexOf(req.params.app_name)>-1 ){
              cb(helpers.invalid_data("app name not allowed: "+req.params.app_name, "account_handler", exports.version, "write_data"));
          } else {
              cb(app_err("Collection name "+collection_name+"is invalid."));
          }
      } else {
          cb(null);
      }
    },


    // 3. get data_object_id (if needed to be set manually)
    //     and if file: error check and write file
    function(cb) {
      if (fileParams.is_attached) {
        fileParams.dir = (req.body.options && req.body.options.targetFolder)?req.body.options.targetFolder : "";
        data_object_id = file_handler.removeStartAndEndSlashes(user_id+"/"+file_handler.removeStartAndEndSlashes(""+fileParams.dir));
        fileParams.dir = file_handler.normUrl(file_handler.removeStartAndEndSlashes("userfiles/"+user_id+"/"+req.params.app_name+"/"+file_handler.removeStartAndEndSlashes(""+fileParams.dir)) );
        fileParams.name = ( req.body.options && req.body.options.fileName)?req.body.options.fileName : req.file.originalname;

        if (!helpers.valid_filename(fileParams.name) ) {
            cb(app_err("Invalid file name"));
        } else if (data_model && data_model.files && data_model.files.allowed_file_types && data_model.files.allowed_file_types.length>0 && data_model.files.allowed_file_types.indexOf(file_handler.fileExt(fileParams.name))<0 ){
            cb(app_err("invalid file type"));
        } else if (!file_handler.valid_path_extension(fileParams.dir)) {
            cb(app_err("invalid folder name"));
        } else {
            data_object_id = data_object_id+"/"+fileParams.name;
            file_handler.writeUserFile(fileParams.dir, fileParams.name, req.body.options, data_model, req, cb);
        }
      } else if (restoreRecord && !updateRecord) {
        if (!req.body.options.KeepUpdateIds){
            delete write._id;
        }
        cb(null, null);
      } else if (!updateRecord
                && (!data_model || !data_model.make_data_id || (!data_model.make_data_id.from_field_names && !data_model.make_data_id.manual))) {
        delete write._id;
        cb(null, null);
      } else if (updateRecord) { // 201909: redundant now that have it further below?
        delete write._id;
        cb(null, null);
      } else if (data_model && data_model.make_data_id && data_model.make_data_id.manual) {
        if (write._id) {
          cb(null, null);
        } else {
          console.warn("write error for "+data_object_id,write)
          cb(app_err("object id is set to manual but is missing"));
        }
      // then is must be make_data_id.from_field_names...
      } else if  (data_model && data_model.make_data_id && (!data_model.make_data_id.reference_field_names || !(data_model.make_data_id.reference_field_names instanceof Array) || data_model.make_data_id.reference_field_names.length==0) ){
        cb(app_err("object id reference field_names but none are included"));
      } else {
        let err = null;
        try {
            data_object_id = unique_id_from(data_model.make_data_id.reference_field_names, req.body.data, user_id);
        } catch (e) {
            err=e;
        }
        if (err) {cb(app_err("Could not set object_id - "+err));} else {cb(null);}
      }
    },

    // 4. set appcollowner and get object_id and get existing object (if it exists).
    function (new_file_name, cb) {
      if (fileParams.is_attached && new_file_name != fileParams.name) {
        var last =  data_object_id.lastIndexOf(fileParams.name);
        if (last>0) {
            data_object_id = data_object_id.substring(0,last)+new_file_name;
        } else {
            console.warn("SNBH - no file name in obejct id")
        }
      }
      appcollowner = {
        app_name:req.params.app_name,
        collection_name:collection_name,
        _owner:user_id
      }
      if (!data_object_id) {
        cb(null, null);
      } else {
        db_handler.db_find(req.freezr_environment, appcollowner, data_object_id, {}, cb)
      }
    },

    // 5. write or update the results
      function (results, cb) {
        //onsole.log("Going to write id "+data_object_id+((results && results.length>0)? "item exists": "new item"));
        //onsole.log("results of finding ",results)
        //onsole.log("data_model ",JSON.stringify(data_model))

        if (fileParams.is_attached) {write._folder = (req.body.options && req.body.options.targetFolder)? file_handler.removeStartAndEndSlashes(req.body.options.targetFolder):"/";}

        // set confirm_return_fields
        var return_fields_list = (req.body.options && req.body.options.confirm_return_fields)? req.body.options.confirm_return_fields: ['_id'];
        for (var i =0; i<return_fields_list.length; i++) {
            if ((typeof return_fields_list[i] == "string")  &&
                write[return_fields_list[i]]) {
                returned_confirm_fields[return_fields_list[i]] = write[return_fields_list[i]];
            }
            if (data_object_id) {returned_confirm_fields._id = data_object_id};
        }


        if ((results == null || results.length == 0) && req.body.options && req.body.options.updateRecord && !restoreRecord && (!data_model || !data_model.make_data_id || !data_model.make_data_id.manual) ){
            cb(helpers.rec_missing_error(exports.version, "write_data", req.params.app_name, "Document not found. (updateRecord with no record) for record "))
        } else if (results && results[0] && results[0]._owner != user_id && !restoreRecord) {
              cb(helpers.auth_failure("app_handler", exports.version, "write_data", req.params.app_name, "Cannot write to another user's record"));
        } else if ( (results == null || results.length == 0) ) { // new document
            if ((req.body.options && req.body.options.fileOverWrite) && fileParams.is_attached) flags.add('warnings','fileRecordExistsWithNoFile');
            db_handler.db_insert(req.freezr_environment, appcollowner, data_object_id, write, {restoreRecord: restoreRecord}, cb)
        } else if (results.length == 1
                    && (  ((updateRecord || upsertRecord) || (data_model && data_model.make_data_id && data_model.make_data_id.manual))
                       || (fileParams.is_attached  && (req.body.options && req.body.options.fileOverWrite)) )
                    && results[0]._owner == user_id) { // file data being updated
          let old_object = results[0]
          isAccessibleObject = (old_object._accessible_By && old_object._accessible_By.groups && old_object._accessible_By.groups.length>0); // 201909 - to review
          returned_confirm_fields._updatedRecord=true;
          delete write._id;
          db_handler.update_app_record (req.freezr_environment, appcollowner, data_object_id, old_object,write, cb)
        } else if (results.length == 1) {
            cb(app_err("data object ("+data_object_id+") already exists. Set updateRecord to true in options to update a document, or fileOverWrite to true when uploading files."));
        } else {
            cb(app_err("Multiple Objects retrieved - SNBH"));
        }
      },

      //if it is an accessible object then update the accessible_object record too
      // get permission db
      function(write_confirm, cb) {
        final_object = (final_object || ((write_confirm && write_confirm.entity)? write_confirm.entity:null));
        if (!isAccessibleObject) {
          cb(null, cb)
        } else if (!final_object){
          cb(app_err("Did not get back a final object for object ("+data_object_id+"). Accessile object not updated. May need to reset access or try again."));
        } else {
          const accessibles_collection = {
            app_name:'info_freezr_permissions',
            collection_name:"accessible_objects",
            _owner:'freezr_admin'
          }
          //onsole.log(final_object._accessible_By)
          if (final_object._accessible_By.group_perms.public) { // todo? also do for non public?
              async.forEach(final_object._accessible_By.group_perms.public, function (requestorapp_permname, cb2) {
                var acc_id = user_id+"/"+requestorapp_permname+"/"+req.params.app_name+"/"+collection_name+"/"+data_object_id;
                //onsole.log("getting acc_id "+acc_id)
                db_handler.db_getbyid(req.freezr_environment, accessibles_collection, acc_id, function(err, results) {
                  if (!results) {
                      flags.add('warnings', "missing_accessible", {"_id":acc_id, "msg":"permission does not exist - may have been removed - should remove public"});
                      cb2(null);
                  } else {
                      permission_object = results;
                      permission_object.data_object = {};
                      var requestorApp = requestorapp_permname.split("/")[0];

                      file_handler.async_app_config(requestorApp, req.freezr_environment, function(err, requestorAppConfig){
                          if (err) {
                              console.warn("Error getting requestorAppConfig - todo - consider issuing flad rather than error")
                              cb(helpers.state_error("app_handler.js", exports.version, "write_data", err, "Could not get requestor app config"));
                          } else {
                              const permission_name = requestorapp_permname.split("/")[1];
                              const permission_model= (requestorAppConfig && requestorAppConfig.permissions && requestorAppConfig.permissions[permission_name])? requestorAppConfig.permissions[permission_name]: null;
                              let new_data_obj={}
                              if (requestorAppConfig && permission_name && permission_model){
                                  if (permission_model.return_fields){
                                      for (var i=0; i<permission_model.return_fields.length; i++) {
                                          new_data_obj[permission_model.return_fields[i]] =  final_object[permission_model.return_fields[i]];
                                      }
                                  } else {
                                      new_data_obj = final_object;
                                  }
                                  permission_object.data_object = new_data_obj;
                                  db_handler.replace_accessible_record (req.freezr_environment, accessibles_collection, acc_id, permission_object, cb)
                              } else {
                                  flags.add('warnings', "app_config_error", {"_id":acc_id, "msg":"no "+(requestorAppConfig?"app_config":("permission_name or model for "+permission_name))});
                                  cb2(null);
                              }
                          }
                      })
                  }
              });
          },
          function (err) {
              console.warn({flags})
              if (err) {
                  flags.add('warnings',"unkown_error_accessibles", err);
              }
              cb(null)
          })
          } else {
            // non public objects are handled differently
            cb(null)
          }
        }
      }
    ],
    function (err) {
        if (err) {
            helpers.send_failure(res, err, "app_handler", exports.version, "write_data");
        } else {
            //onsole.log({final_object})
            if (final_object && final_object._id) returned_confirm_fields._id = final_object._id; // new document
            if (final_object && final_object._date_Created) returned_confirm_fields._date_Created = final_object._date_Created;
            if (flags && flags.warnings) console.warn("=== write_data FLAG WARNINGS === "+JSON.stringify(flags))
            helpers.send_success(res, {"success":true, "error":null, "confirmed_fields":returned_confirm_fields,  'duplicated_file':fileParams.duplicated_file, 'flags':flags});
        }
    });
}

exports.getDataObject= function(req, res) {
  //let url = '/ceps/get/'+requestee_app+'/'collection_name+'/'+data_object_id+ "?"+(requestee_app==freezr_app_name? "":("requestor_app="+freezr_app_name)) + (permission_name? ("permission_name="+permission_name):"")
  // app.get('/ceps/get/:requestee_app/:collection_name/:user_id/:data_object_id', userDataAccessRights, app_handler.getDataObject);
  // app.get('/ceps/get/:requestee_app/:collection_name/:data_object_id', userDataAccessRights, app_handler.getDataObject);
  //app.get('/ceps/userfile/:requestee_app/:user_id/*', userDataAccessRights, app_handler.getDataObject);
          // "/ceps/userfile/"+requestee_app+"/"+fileId+(permission_name?("?permission_name"=permission_name):""); (and for public files, ca  have requestor_app in url query)

    //app.get('/v1/db/getbyid/:permission_name/:collection_name/:requestor_app/:source_app_code/:requestee_app/:data_object_id', app_handler.getDataObject); // here request type must be "one"
    //app.get('/v1/userfiles/:permission_name/:collection_name/:requestor_app/:source_app_code/:requestee_app/:user_id/*', app_handler.getDataObject);
                                                                    //  '/ceps/userfile/:requestee_app/:user_id/*'
    // "/ceps/userfile/"+requestee_app+"/"+fileId+(permission_name?("?permission_name"=permission_name):"");

  let record_is_permitted = false,
      the_granted_perm = null,
      resulting_record = null,
      own_record=false;
  let data_object_id, parts, requestedFolder, flags;

  // Initialize variables
  let request_file = helpers.startsWith(req.path,"/ceps/userfile") ;
  if (request_file) {
    req.params.collection_name = "files"
    parts = req.originalUrl.split('/');
    parts.splice(0,5,"userfiles",req.params.user_id,req.params.requestee_app);
    requestedFolder = parts.length==4? "/": (parts.slice(3,parts.length-1)).join("/");
    data_object_id = req.params.user_id+"/"+unescape(parts.slice(3).join("/"));
    if (data_object_id.indexOf('?')>-1) {
      let parts2=data_object_id.split('?');
      req.params.permission_name = parts2[1];
      data_object_id = parts2[0]
    }
    //onsole.log("requestes folder now ",requestedFolder,"data_object_id for userfile now ",data_object_id)
  } else {
    data_object_id = req.params.data_object_id;
  }

  function app_err(message) {return helpers.app_data_error(exports.version, "getDataObject", req.params.app_name, message);}
  function app_auth(message) {return helpers.auth_failure("app_handler", exports.version, "getDataObject", message);}
  //onsole.log("getDataObject "+data_object_id+" from coll "+req.params.collection_name);

  async.waterfall([
    // 1. check app code and device (get user id and requestr app)
    function (cb) {
      db_handler.check_app_token_and_params(req, {user_id:req.params.user_id}, function(err, user_id, requestor_app, logged_in) {
        //onsole.log("get data object req.params.requestor_app:"+ req.params.requestor_app+"  requestor_app"+requestor_app)
        req.params.requestor_id = user_id;
        req.params.user_id = req.params.user_id || user_id
        req.params.requestor_app = req.params.requestor_app || requestor_app || req.query.requestor_app
        if (err) {
          console.warn(err)
          cb (app_auth("error getting device token"), "app_handler", exports.version, "getDataObject");
        } else if (req.params.requestor_app != requestor_app || !req.params.requestor_app) {
          cb(app_auth("requestor_app in params different from app token"), "app_handler", exports.version, "getDataObject");
        } else if (req.query.requestor_app && req.query.requestor_app != req.params.requestor_app) {
          cb(app_auth("requestor_app in query different from app token"), "app_handler", exports.version, "getDataObject");
        } else if (!data_object_id){
          cb(app_err("missing data_object_id"));
        } else if (req.params.requestor_app == "info.freezr.admin" || req.params.requestee_app == "info.freezr.admin") {
          // NB this should be redundant but adding it in any case
          cb(app_auth("Should not access admin db via this interface"));
        } else {
          if (req.params.requestor_app==req.params.requestee_app && req.params.requestor_id == req.params.user_id){
            own_record = true;
            record_is_permitted = true;
          }
          flags = new Flags({'app_name':req.params.requestor_app});
          cb(null)
        }
      })
    },

    // 2. get item.. if own_record, go to end. if not, get all record permissions
    function (cb) {
      let appcollowner = {
        app_name:req.params.requestee_app,
        collection_name:req.params.collection_name,
        _owner:req.params.user_id
      }
      db_handler.db_getbyid (req.freezr_environment, appcollowner, data_object_id, cb)
    },
    function (results, cb) {
      //onsole.log("got results ",results)
      if (!results) {
        cb(app_err("no related records"))
      } else {
        resulting_record = results;
        if (own_record) {
          record_is_permitted = true;
          cb(null, null)
        } else {
          db_handler.granted_permissions_by_owner_and_apps (req.freezr_environment, req.params.user_id, req.params.requestor_app, req.params.requestee_app, cb)
        }
      }
    },

    // 3, get permissions and check against record permissions - Note this step would be redundant if database updates properly after a premission has been revoked, but even if that was relatively assured (which it isnt as of 2019, this is provides extra reducnacy)
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
              if (app_name == req.params.requestor_app && permissions_granted.indexOf(permissions_granted)>-1) {
                result = true;
                the_granted_perm=aPerm;
              }
            })
            return result
          }

          let loggedInAccess = (resulting_record._accessible_By && resulting_record._accessible_By.group_perms && resulting_record._accessible_By.group_perms.logged_in)? resulting_record._accessible_By.group_perms.logged_in: null;
          if (loggedInAccess && loggedInAccess.length>0 && req.session.logged_in) {
            if (check_access(loggedInAccess)) {
              have_access = have_access || check_access(publicAccess);;
            }
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
        //onsole.log("got to end of getDataObject");


        if (!record_is_permitted || err) {
          if (request_file){
            console.warn(err)
            res.sendStatus(401);
          } else {
              helpers.send_failure(res, err, "app_handler", exports.version, "getDataObject");
          }
        } else if (request_file){
          //onsole.log("sending getDataObject "+__dirname.replace("/freezr_system","/") + unescape(parts.join('/')));
          if (flags.warnings) console.warn("flags:"+JSON.stringify(flags))
          file_handler.sendUserFile(res, unescape(parts.join('/')), req.freezr_environment );
        } else {
          // todo - permission_model has to come from the perm
          if (!own_record && !request_file && the_granted_perm && the_granted_perm.return_fields && the_granted_perm.return_fields.length>0) {
              let new_record = {};
              for (var i=0; i<the_granted_perm.return_fields.length; i++) {
                  new_record[the_granted_perm.return_fields[i]] = resulting_record[the_granted_perm.return_fields[i]];
              }
              resulting_record = new_record;
          }
          helpers.send_success(res, {'results':resulting_record, 'flags':flags});
        }
    });
}

exports.db_query = function (req, res){
    helpers.log (req,"db_query: "+req.url+" body "+JSON.stringify(req.body))
    //onsole.log("db_query from: "+req.params.requestor_app+" - "); // +JSON.stringify(req.body)
    // app.post('/ceps/query', userDataAccessRights, app_handler.db_query);
    // app.post('/ceps/query/:requestor_app', userDataAccessRights, app_handler.db_query);

    // options are:
      // permission_name
      // collection - default is to use the first in list for object_delegate
      // app_name is the requestee app  and can be added optionally to cehck against the app_config permission (which also has it)
      // query_params is any list of query parameters
      // only_others excludes own records

    req.app_err = function (message) {return helpers.app_data_error(exports.version, "db_query", req.params.requestor_app, message);}
    req.app_auth_err = function (message) {return helpers.auth_failure("app_handler", exports.version, "db_query", message+" "+req.params.requestor_app);}

    db_handler.check_app_token_and_params(req, {user_id:req.params.user_id}, function(err, user_id, requestor_app, logged_in) {
      //onsole.log("get data object req.params.requestor_app:"+ req.params.requestor_app+"  requestor_app"+requestor_app)
      req.params.user_id = req.params.user_id || user_id
      req.params.requestor_app = req.params.requestor_app || requestor_app
      if (err) {
        console.warn(err)
        helpers.send_failure(res, req.app_auth_err("error getting device token"), "app_handler", exports.version, "db_query");
      } else if (req.params.user_id != user_id || !req.params.user_id) {
        helpers.send_failure(res, req.app_auth_err("user id in params different from app token"), "app_handler", exports.version, "db_query");
      } else if (req.params.requestor_app != requestor_app || !req.params.requestor_app) {
        helpers.send_failure(res, req.app_auth_err("requestor_app in params different from app token"), "app_handler", exports.version, "db_query");
      } else if (req.params.requestor_app == "info.freezr.admin" || req.body.app_name == "info.freezr.admin") {
          // NB this should be redundant but adding it in any case
          helpers.send_failure(res, req.app_auth_err("Should not access admin db via this interface"), "app_handler", exports.version, "db_query");
      } else if (!req.body.permission_name) { //ie own_record
          let usersWhoGrantedAppPermission = [{'_owner':req.params.user_id}]; // if requestor is same as requestee then user is automatically included
          req.params.collection_name = req.body.collection || "main"
          req.params.requestee_app = req.params.requestor_app
          do_db_query(req,res, usersWhoGrantedAppPermission)
      } else {
          get_all_query_perms(req, res, function(req, res, usersWhoGrantedAppPermission){
            do_db_query(req,res, usersWhoGrantedAppPermission)
          })
      }
    })
}

do_db_query = function (req,res, usersWhoGrantedAppPermission) {
  // does the db_query after basic security checks - ie who has authorised tthe request and app tokem validation
  // all appcollowner paramatewrs must have beeb checked before do_db_query
  const appcollowner = {
    app_name:req.params.requestee_app,
    collection_name:req.params.collection_name,
    _owner:req.params.user_id
  }
  //onsole.log("do db query",req.body.query_params,"usersWhoGrantedAppPermission:",usersWhoGrantedAppPermission, "appcollowner",appcollowner)

  if (!req.body.query_params || Object.keys(req.body.query_params).length==0) {
    if (usersWhoGrantedAppPermission.length==1) {
      req.body.query_params = usersWhoGrantedAppPermission[0];
    } else {
      req.body.query_params = usersWhoGrantedAppPermission;
    }
  } else if (req.body.query_params.$and) {
    req.body.query_params.$and = [ ...req.body.query_params.$and, ...usersWhoGrantedAppPermission]
  } else {
      req.body.query_params = {'$and':[req.body.query_params, ...usersWhoGrantedAppPermission ]};
  }

  //onsole.log("query_params is "+JSON.stringify(query_params));
  req.body.skip = req.body.skip? parseInt(req.body.skip): 0;
  req.body.count= req.body.count? parseInt(req.body.count):(req.params.max_count? req.params.max_count: 50);
  req.body.count = Math.min(req.body.count, (req.params.max_count || 0) )
  if (!req.body.sort && req.body.sort_field) {
      req.body.sort = {}
      req.body.sort[req.body.sort_field] = req.body.sort_direction? parseInt(sort_direction):-1;
  } else if (!req.body.sort) {
      req.body.sort =  {'_date_Modified': -1}
  }
  //onsole.log("In query to find", req.body.query_params)
  db_handler.db_find(req.freezr_environment, appcollowner,req.body.query_params,
    {sort: req.body.sort, count:req.body.count, skip:req.body.skip}, function(err, results) {
    // onsole.log("Query resuilts are ",results)
    let returnArray = [], aReturnObject={};

    if (!req.params.return_fields || !results) {
        returnArray = results
    } else {
        for (var i= 0; i<results.length; i++) {
          aReturnObject = {};
          for (j=0; j<req.params.return_fields.length;j++) {
              aReturnObject[req.params.return_fields[j]] = results[i][req.params.return_fields[j]];
          }
          returnArray.push(aReturnObject);
        }
    }
    if (req.internalcallfwd){
        req.internalcallfwd(err, returnArray)
    } else if (err) {
        console.warn("err at end of db_query (do_db_query) "+err)
        helpers.send_failure(res, err, "app_handler", exports.version, "do_db_query");
    } else {
        helpers.send_success(res, {'results':returnArray});
    }
  })
}

get_all_query_perms = function (req, res, callback) {
  // reviews all query params to see who has granted permission on which app
  let app_config, app_config_permission_schema, permission_attributes;
  let usersWhoGrantedAppPermission=[];

  async.waterfall([
    // 1 get app config
    function (cb) {
      file_handler.async_app_config(req.params.requestor_app, req.freezr_environment,cb);
    },
    // .. and check all data needed exists
    function (the_app_config, cb) {
      app_config = the_app_config;
      app_config_permission_schema = (app_config && app_config.permissions)? app_config.permissions[req.body.permission_name]: null;

      if (!app_config){
        cb(req.app_err("Missing app_config for ",req.params.requestor_app));
      } else if (!app_config_permission_schema || !req.body.permission_name){
        cb(req.app_err("Missing permission_schema for ",req.params.requestor_app));
      } else {
        if (!app_config_permission_schema.collections) app_config_permission_schema.collections = []
        if (req.body.collection && (req.body.collection !=app_config_permission_schema.collection ||
                                    app_config_permission_schema.collections.indexOf(req.body.collection)<0
                                  )) {
          cb(req.app_auth_err("collection not allowed"))
        } else if (!req.body.collection && !app_config_permission_schema.collection && !app_config_permission_schema.collections[0]){
          cb(req.app_auth_err("missing collection_name"));
        } else {
          req.params.collection_name = req.body.collection || app_config_permission_schema.collection || app_config_permission_schema.collections[0]

          req.params.requestee_app = app_config_permission_schema.requestee_app || req.params.requestor_app

          req.params.max_count = (app_config_permission_schema && app_config_permission_schema.max_count)? app_config_permission_schema.max_count:null;

          permission_attributes = {
              'requestor_app': req.params.requestor_app,
              'requestee_app': req.params.requestee_app,
              'permission_name': req.params.permission_name,
              'granted':true
          };
          //onsole.log("own_record",own_record," req.params.requestor_app",req.params.requestor_app," permission_attributes.requestee_app",permission_attributes.requestee_app," req.params.permission_name",req.params.permission_name)

          usersWhoGrantedAppPermission = (req.params.requestee_app == req.params.requestor_app && !req.body.only_others)? [{'_owner':req.params.user_id}]: []; // if requestor is same as requestee then user is automatically included
          cb(null);
        }
      }
    },

    // 2. Get app permission
    function (cb) {
            db_handler.all_granted_app_permissions_by_name(req.freezr_environment, req.params.requestor_app, req.params.requestee_app, req.params.permission_name, null , cb)
    },
    // ... and add the people who have granted the permission to usersWhoGrantedAppPermission list
    function (allUserPermissions, cb) {
      //onsole.log("allUserPermissions",allUserPermissions)
      if (allUserPermissions && allUserPermissions.length>0) {
        for (var i=0; i<allUserPermissions.length; i++) {
          if (allUserPermissions[i].sharable_groups
              &&
              ( allUserPermissions[i].permitter != req.params.user_id ||
                !req.body.only_others)
              &&
              ((allUserPermissions[i].sharable_groups.indexOf("logged_in")>-1
                  && req.session.logged_in_user_id) ||
               (allUserPermissions[i].sharable_groups.indexOf("user")>-1
                  && req.params.user_id) ||
               (allUserPermissions[i].sharable_groups.indexOf("public")>-1)
              // todo - if statement to be pushed in db_handler as a function... and used in other permission functions as an extra security (and everntually to allow non logged in users)
          )) {
            usersWhoGrantedAppPermission.push({'_owner':allUserPermissions[i].permitter});
          }
        }
      }
      if (usersWhoGrantedAppPermission.length>0) {
          cb(null)
      } else {
          cb(app_auth_err("No users have granted permissions for permission:"+req.params.permission_name));
      }
    },

    // adds specific criteria to the query parameters
    function (cb) {
      let theOrs = [], err=null
      if (app_config_permission_schema.type=="object_delegate") {
          if (!req.body.query_params.$and) req.body.query_params = {'$and':[req.body.query_params]};

          let perm_string = permission_attributes.requestor_app+"/"+permission_attributes.permission_name
          if (app_config_permission_schema.sharable_groups && app_config_permission_schema.sharable_groups.length>0) {
              if (app_config_permission_schema.sharable_groups.indexOf('public')>-1) theOrs.push({'_accessible_By.group_perms.public':perm_string})
              if (app_config_permission_schema.sharable_groups.indexOf('logged_in')>-1 && req.session.logged_in_user_id) theOrs.push({'_accessible_By.group_perms.logged_in':perm_string})
              if (app_config_permission_schema.sharable_groups.indexOf('user')>-1 && req.params.user_id) {
                  var a_user_obj={}
                  a_user_obj['_accessible_By.user_perms.'+req.params.user_id]=perm_string;
                  theOrs.push(a_user_obj);
              }
              if (!req.body.only_others && req.params.requestee_app == req.params.requestor_app) theOrs.push({'_owner':req.params.user_id})
          }
          if (theOrs.length==0) {
              cb(app_err("permission schema has no sharables"));
          } else if (theOrs.length == 1) {
              theOrs = theOrs[0]
          } else {
              theOrs = {'$or':theOrs}
          }
          req.body.query_params.$and.push(theOrs);
          // replace above with parameterized one
      } else if (app_config_permission_schema.type=="db_query") {
        let skip = req.body.skip || 0;
        if (app_config_permission_schema.max_count && req.body.count+skip>app_config_permission_schema.max_count) {
          req.body.count = Math.max(0,app_config_permission_schema.max_count-skip);
        }
        if (app_config_permission_schema.sort_fields) {
            req.body.sort = app_config_permission_schema.sort_fields;
        }

        // permitted query_params
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
              } else if (['$lt','$gt','_date_Modified'].indexOf(key)>-1) {
                // do nothing
              } else if (permitted_fields.indexOf(key)<0) {
                return (new Error("field not permitted "+key))
              }
            }
          }
        }
        if (app_config_permission_schema.permitted_fields && app_config_permission_schema.permitted_fields.length>0 && Object.keys(req.body.query_params).length > 0) {
          err = check_query_params_permitted(req.body.query_params,app_config_permission_schema.permitted_fields)
        }
      }
      // return_fields
      if (app_config_permission_schema.return_fields && app_config_permission_schema.return_fields.length>0) {
        req.params.return_fields = app_config_permission_schema.return_fields
      } else {
        req.params.return_fields = null
      }
      cb(err);
    }
  ],
  function (err, results) {
    if (err) {
      helpers.send_failure(res, err, "app_handler", exports.version, "get_all_query_perms");
    } else {
      do_db_query(req,res, usersWhoGrantedAppPermission)
    }
  })
}


// permission access operations
exports.setObjectAccess = function (req, res) {
  // After app-permission has been given, this sets or updates permission to access a record
  //app.put('/v1/permissions/setobjectaccess/:requestor_app/:source_app_code/:permission_name', userDataAccessRights, app_hdlr.setObjectAccess);
  //'action': 'grant' or 'deny' // default is grant
  //'data_object_id' (a string) or 'query_criteria' (an object with creteria for search) mandaory
  // can have one of:  'shared_with_group':'logged_in' or 'self' or 'public'
  // 'requestee_app': app_name (defaults to self)
  // 'pubDate' -
  // 'pid' - public id to be used
  // todo this could be merged with setFieldAccess
  // note "granted" in accessible-object is redundant - should be set to false if all groups have been removed

  let app_config,
      appcollowner,
      permission_model,
      permission_type,
      requestee_app,
      collection_name,
      dbCollection,
      accessibles_object_id,
      permission_collection,
      accessibles_collection = {
        app_name:'info_freezr_permissions',
        collection_name:"accessible_objects",
        _owner:'freezr_admin'
      },
      search_words = [],
      the_one_public_data_object = [],
      records_changed=0;
      real_object_id=null;

  //onsole.log("req.body",req.body)

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

  helpers.log(req,"setObjectAccess by "+req.session.logged_in_user_id+" for "+data_object_id+" query:"+ JSON.stringify(query_criteria)+" action"+JSON.stringify(req.body.action)+" perm: " +req.params.permission_name,"collection name: ",req.body.collection);

  function app_err(message) {return helpers.app_data_error(exports.version, "write_data", req.params.requestor_app + "- "+message);}

  async.waterfall([
    // 0 get app config
    function (cb) {
        file_handler.async_app_config(req.params.requestor_app, req.freezr_environment,cb);
    },
    // 1. Check all data needed exists
    function (the_app_config, cb) {
        app_config = the_app_config;

        permission_model= (app_config && app_config.permissions && app_config.permissions[req.params.permission_name])? app_config.permissions[req.params.permission_name]: null;
        permission_type = (permission_model && permission_model && permission_model.type)? permission_model.type: null;
        requestee_app = req.body.requestee_app? req.body.requestee_app: req.params.requestor_app;
        collection_name = req.body.collection? req.body.collection: ((permission_model && permission_model.collections && permission_model.collections.length>0)? permission_model.collections[0] : null);
        accessibles_object_id = req.body.publicid || req.session.logged_in_user_id+"/"+req.params.requestor_app+"/"+req.params.permission_name+"/"+requestee_app+"/"+collection_name+"/"+data_object_id;

        if (!req.session.logged_in_user_id) {
            cb(helpers.auth_failure("app_handler", exports.version, "setObjectAccess", req.params.app_name, "Need to be logged in to access app"));
        } else if (!app_config){
            cb(app_err("Missing app_config"));
        } else if (!permission_model){
            cb(app_err("Missing permission"));
        } else if (!permission_type){
            cb(app_err("Missing permission type"));
        } else if ( permission_model.sharable_groups.indexOf(new_shared_with_group) <0) {
            cb(app_err("permission group requested is not permitted "+new_shared_with_group));
        } else if (permission_type != "object_delegate"){
            cb(app_err("permission type mismatch"));
        } else if (helpers.permitted_types.groups_for_objects.indexOf(new_shared_with_group)<0 ){
            cb(app_err("invalid permission group"));
        } else if (!collection_name){
            cb(app_err("Missing collection"));
        } else if (permission_model.collections.indexOf(collection_name)<0){
            cb(app_err("Collection name cannot be used with this permission"));
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
            cb(null);
        }
    },

    // 1. check app token
    function (cb) {
      let checks = {user_id: req.session.user_id, logged_in:true, requestor_app:"info.freezr.account"}
      db_handler.check_app_token_and_params(req, checks, cb)
    },

    // 3. get app permissions
    function(cb) {
      db_handler.permission_by_owner_and_permissionName (req.freezr_environment, req.session.logged_in_user_id, req.params.requestor_app, requestee_app, req.params.permission_name, cb)
    },

    // 4. check permission is granted and can authorize requested fields, and if so, get permission collection
    // 5. open object by id
    function (results, cb) {
      //onsole.log("permission_by_owner_and_permissionName")
      //onsole.log(results)

      if (!results || results.length==0) {
          cb(helpers.error("PermissionMissing","permission does not exist"))
      }  else if (!results[0].granted) {
          cb(helpers.error("PermissionNotGranted","permission not granted yet"))
      }  else if (!results[0].collections || results[0].collections.length<0)  {
          cb(app_err("No collections sited in config file"))
      }  else if (results[0].collections.indexOf(collection_name) < 0)  {
          cb(app_err("bad collection_name"))
      } else {
          appcollowner = {
            app_name:requestee_app,
            collection_name:collection_name,
            _owner:req.session.logged_in_user_id
          }
          if (query_criteria) query_criteria._owner = req.session.logged_in_user_id;

          db_handler.db_find(req.freezr_environment, appcollowner,
            (data_object_id? {'_id':data_object_id,'_owner':req.session.logged_in_user_id}
                            : query_criteria),
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

                if (data_object._owner != req.session.logged_in_user_id) {cb2(helpers.auth_failure("app_handler", exports.version, "setObjectAccess", req.params.app_name +  "Attempt to try and set access permissions for others"));}

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

                // note purposefully hardoded so only these changes will be accepted in db_handler: _accessible_By, _publicid, _date_Published
                var changes = {_accessible_By:accessibles}
                if (addToAccessibles) changes._publicid = (doGrant? accessibles_object_id: null);
                changes._date_Published = date_Published;
                records_changed++
                db_handler.update_object_accessibility (req.freezr_environment, appcollowner, data_object._id, data_object, changes, cb)

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
      if (the_one_public_data_object.length>1) {
          cb(app_err("Cannot set multiple records to accessible. Feature to be created later."));
          console.warn(the_one_public_data_object)
      } else if (addToAccessibles) {
        //onsole.log("7 find "+req.session.logged_in_user_id+" for "+data_object_id+ " accessibles_object_id:"+accessibles_object_id)

        db_handler.db_find(req.freezr_environment, accessibles_collection, {"data_owner":req.session.logged_in_user_id,"data_object_id":data_object_id}, {}, cb)

      } else {cb(null, null)}
    },
    // 8. write or update the results
    function (results, cb) {
      //onsole.log("results",results)
        if (addToAccessibles) {
            if (results == null || results.length == 0) {
                //  accessibles_object_id automated version is req.session.logged_in_user_id+"/"+req.params.requestor_app+"/"+req.params.permission_name+"/"+requestee_app+"/"+collection_name+"/"+data_object_id;
                var accessibles_object = {
                    'requestee_app':requestee_app,
                    'data_owner':req.session.logged_in_user_id,
                    'data_object_id': data_object_id,
                    'permission_name':req.params.permission_name,
                    'requestor_app':req.params.requestor_app,
                    'collection_name': collection_name,
                    'shared_with_group':[new_shared_with_group],
                    'shared_with_user':[new_shared_with_user],
                    '_date_Published' :date_Published,
                    'data_object' : the_one_public_data_object[0], // make this async and go through al of them
                    'search_words' : search_words,
                    'granted':doGrant,

                    '_id':accessibles_object_id
                    }
                if (!doGrant) {
                    app_err("cannot remove a permission that doesnt exist");
                    cb(null); // Internal error which can be ignored as non-existant permission was being removed
                } else { // write new permission
                    db_handler.db_insert (req.freezr_environment, accessibles_collection, null, accessibles_object, {keepReservedFields:true}, cb)
                }
            } else  { // update existing perm
              if (results.length >1) {helpers.state_error( "app_handler", exports.version, "setObjectAccess","multiple_permissions", new Error("Retrieved mkroe than one permission where there should only be one "+JSON.stringify(results)), null)} // todo delete other ones?
                var write = {};
                if (results[0].granted && results[0].data_object && results[0].data_object._owner != req.session.logged_in_user_id) {
                    cb(app_err("Cannot overwrite an existing accessible object - other user"));
                } else if (results[0].granted && results[0].requestor_app != req.params.requestor_app){
                    cb(app_err("Cannot overwrite an existing accessible object - other app"));
                } else if (results[0].granted && results[0].data_object_id != data_object_id){
                    cb(app_err("Cannot overwrite an existing accessible object - other app"));
                }
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
                // to review why this was repeted - replace_accessible_record now should handle just the changes. Any reason to redo all?
                write._date_Published = date_Published;
                write.data_object = the_one_public_data_object[0];
                write.search_words = search_words;
                write.requestee_app = requestee_app;  // in case of re-use of another object
                write.data_owner = req.session.logged_in_user_id;  // in case of re-use of another object
                write.data_object_id = data_object_id; // in case of re-use of another object
                write.permission_name = req.params.permission_name;  // in case of re-use of another object
                write.requestor_app = req.params.requestor_app; // in case of re-use of another object
                write.collection_name = collection_name; // in case of re-use of another object
                db_handler.replace_accessible_record (req.freezr_environment, accessibles_collection, accessibles_object_id, write, cb)
            }
        } else {cb(null, null)}
    },

    // 10 Add accessible id back to object
    function(results, cb) {
        if (addToAccessibles) {
          the_one_public_data_object[0]._publicid = doGrant? accessibles_object_id: null;
          db_handler.update_app_record (req.freezr_environment, appcollowner, data_object_id, the_one_public_data_object[0], the_one_public_data_object[0], cb)
        } else {cb(null, null)}
    }
  ],
  function (err, results) {
      if (err) {
          console.warn(err)
          helpers.send_failure(res, err, "app_handler", exports.version, "setObjectAccess");
      } else { // sending back data_object_id
          helpers.send_success(res, {"data_object_id":the_one_public_data_object[0]._id, "_publicid": (doGrant? accessibles_object_id: null),'accessibles_object_id':accessibles_object_id, '_date_Published':date_Published, 'grant':doGrant,'issues':issues, 'query_criteria':query_criteria, 'records_changed':records_changed});
      }
  });
}

// developer utilities
    exports.getConfig = function (req, res){
        //app.get(''/v1/developer/config/:app_name/:source_app_code'

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
              let checks = {user_id: req.session.user_id, logged_in:true, requestor_app:"info.freezr.account"}
              db_handler.check_app_token_and_params(req, checks, cb)
            },

            // 3. open database connection & get collections
            function (cb) {
              db_handler.getAllCollectionNames(req.freezr_environment, req.params.app_name.replace(/\./g,"_"), cb);
            },

            // 4. keep names
            function (names, cb) {
              collection_names = names;
              cb(null)
            },

        ],
        function (err) {
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
                                        write._owner = req.session.logged_in_user_id;
                                        write._date_Modified = new Date().getTime();
                                        write._id = data_object_id;
                                        write._folder = req.params.folder_name? req.params.folder_name:file_handler.sep();
                                        write._date_Created = new Date().getTime();
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
    var newObjectFieldNamesAreValid = function(req, data_model) {
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

            if (req && req.body && req.body.data) {
                for (key in req.body.data) {
                    if (req.body.data.hasOwnProperty(key)) {
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

            // check if file is sent but shouldnt be
            if (data_model && data_model.strictly_Adhere_To_schema && !data_model.file && req.file) {
                helpers.warning("app_handler", exports.version, "newObjectFieldNamesAreValid","ER  SENDIGN FILES WHEN IT SHOULDNT BE");
                return false;
            }

            return (req && req.body && req.body.options && req.body.options.updateRecord) || requiredFieldNameList.length==0;
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
        // NOTE - Currently not used... can be used if want to have records point to other records... can be put in write_data
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
