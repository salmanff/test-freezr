// freezr.info - nodejs system files - db_handler.js
exports.version = "0.0.131"; // Changed names from freezr__db

// Note on queries
//  Currently queires must have $and at the top level with no other object keys (ie all must be placed in the àand object)
//  One $or level query can be put inside the top $and, but cannot add more complexity at lower levels $or can only have equalities. (main $and can also have $lt, $gt)
//  Constraints have been added for Google App Engine / Datastore compatibility (or until a better translation algorithm is used to do $or queries on gae)

// Note: Added +"" to allrecord._id's to solve mongo Atlas issue

// todo: review and redo update as it would only be used for admin


const async = require('async'),
      fs = require('fs'),
      helpers = require("./helpers.js"),
      bcrypt = require('bcryptjs'),
      file_handler = require('./file_handler.js'),
      db_default_mongo = require("./environment/db_default_mongo.js") // Default db

let custom_environment= null;

const ARBITRARY_COUNT = 200;

// apc = appcollowner
const PERMISSION_APC = {
  app_name:'info_freezr_admin',
  collection_name:'permissions',
  owner:'fradmin'
}
const PARAMS_APC = {
  app_name:'info_freezr_admin',
  collection_name:'params',
  owner:'fradmin'
}
const USERS_APC = {
  app_name:'info_freezr_admin',
  collection_name:'users',
  owner:'fradmin'
}
const APPLIST_APC = {
  app_name:'info_freezr_admin',
  collection_name:'installed_app_list',
  owner:'fradmin'
}
const OAUTHPERM_APC = {
  app_name:'info_freezr_admin',
  collection_name:"oauth_permissions",
  owner:'fradmin'
}

// INITIALISING
exports.re_init_environment_sync = function(env_params)  {
    // used mostly for testing
    if (env_params && env_params.dbParams && (
      env_params.dbParams.dbtype == "gaeCloudDatastore" ||
      env_params.dbParams.dbtype == "nedb"
    )
    )  {
        const file_env_name = "db_env_"+env_params.dbParams.dbtype+".js";
        if (fs.existsSync(file_handler.systemPathTo('freezr_system/environment/'+file_env_name))) {
            let env_okay = true;
            try {
                custom_environment =  require(file_handler.systemPathTo('freezr_system/environment/'+file_env_name));
            } catch (e) {
                env_okay = false;
                console.warn("**** **** got err in re_init_freezr_environment **** ****")
                return helpers.state_error("db_handler",exports.version,"re_init_freezr_environment", ("error reading file "+file_env_name+" - "+e.message), "error_in_custom_file")
            }
            if (env_okay && custom_environment.re_init_environment_sync) custom_environment.re_init_environment_sync(env_params);
        } else {
            console.warn("file doen't exist "+'freezr_system/environment/'+file_env_name)
        }
    } else {
        custom_environment=null;
    }
}
exports.re_init_freezr_environment = function(env_params, callback)  {
  //onsole.log("in db_handler re_init_freezr_environment with ",env_params)

    if (env_params && env_params.dbParams && (
            env_params.dbParams.dbtype == "gaeCloudDatastore" ||
            env_params.dbParams.dbtype == "nedb"
          ) )  {
      const file_env_name = "db_env_"+env_params.dbParams.dbtype+".js";
        if (fs.existsSync(file_handler.systemPathTo('freezr_system/environment/'+file_env_name))) {
            let env_okay = true;
            try {
                custom_environment =  require(file_handler.systemPathTo('freezr_system/environment/'+file_env_name));
            } catch (e) {
                env_okay = false;
                console.warn("got err in re_init_freezr_environment")
                callback(helpers.state_error("db_handler",exports.version,"re_init_freezr_environment", ("error reading file "+file_env_name+" - "+e.message), "error_in_custom_file") )
            }
            if (env_okay) {
              if (custom_environment.re_init_freezr_environment){
                custom_environment.re_init_freezr_environment(env_params, callback);
              } else {
                callback(null)
              }
            }
        } else {
            console.warn("file doen't exist "+'freezr_system/environment/'+file_env_name)
            callback(helpers.state_error("db_handler",exports.version,"re_init_freezr_environment", ("file doen't exist "+'freezr_system/environment/'+file_env_name), "error_in_custom_file") )
        }
    } else {
        custom_environment=null;
        callback(null)
    }
}
exports.check_db      = function(env_params, callback) {
  //onsole.log("going to check db",env_params)
  const appcollowner = {
    app_name:'info_freezr_admin',
    collection_name : 'params',
    owner: 'fradmin'
  }
  let env_on_db=null;

  dbToUse(env_params).read_by_id(env_params, appcollowner, "freezr_environment", function(err, env_on_db) {
    dbToUse(env_params).read_by_id(env_params, appcollowner, "test_write_id", (err2, savedData) => {
      if (err || err2) {
        console.warn("got err in check_db ",(err? err : err2))
        callback((err? err : err2), env_on_db);
      } else if (savedData){
        exports.update (env_params, appcollowner, "test_write_id", {'foo':'updated bar'}, {replaceAllFields:false},
          (err, ret)=> callback(err, env_on_db))
      } else {
        dbToUse(env_params).create (env_params, appcollowner, "test_write_id", {'foo':'bar'}, null, (err, ret)=> callback(err, env_on_db))
      }
    });
  })
}
var useCustomEnvironment = function(env_params, app_name) {
    //onsole.log("useCustomEnvironment: env_params "+JSON.stringify(env_params))
    if (!env_params || !env_params.dbParams ||
      !custom_environment || !custom_environment.use
      || !custom_environment.customDb
      || !custom_environment.customDb(app_name) ) return false;
    return true;
}
var dbToUse = function(env_params) {
    if (env_params.force_env_reset) {exports.re_init_environment_sync(env_params)}
    if (useCustomEnvironment(env_params)){
        return custom_environment
    } else {
        return db_default_mongo
    }
}

const remove_appcollowner_dots = function (appcollowner){
  new_object={}
  if (appcollowner.app_name) new_object.app_name = appcollowner.app_name.replace(/\./g,"_")
  if (appcollowner.app_table) new_object.app_table = appcollowner.app_table.replace(/\./g,"_")
  new_object.collection_name = appcollowner.collection_name? appcollowner.collection_name.replace(/\./g,"_"):"";
  if (appcollowner.owner) new_object.owner = appcollowner.owner.replace(/\./g,"_");
  return new_object
}

// MAIN PRIMARY FUNCTIONS - Passed on to specific db
exports.create = function (env_params, appcollowner, id, entity, options, cb) {
  // if successful returns  {success:true, entity:entity, issues:{}}
  // assumes appcollowner is fully checked and valid
  // issues will indicate specific non critical errors etc (todo)
  // only inserts one entity at a time
  // options are restore_record: true
  appcollowner = remove_appcollowner_dots(appcollowner)
  if (!options || !options.restore_record){
    if (!options || !options.keepReservedFields) helpers.RESERVED_FIELD_LIST.forEach((aReservedField) => delete entity[aReservedField] )
    entity._date_created  = new Date().getTime();
    entity._date_modified = new Date().getTime();
  }
  dbToUse(env_params).create(env_params, appcollowner, id, entity, options, cb);
}
exports.read_by_id = function (env_params, appcollowner, id, cb) {
  appcollowner = remove_appcollowner_dots(appcollowner)
  dbToUse(env_params).read_by_id(env_params, appcollowner, id, cb);
}
exports.query = function(env_params, appcollowner, idOrQuery={}, options, callback) {
  //onsole.log("query in db_handler ", appcollowner, idOrQuery, (typeof idOrQuery))
  // options are sort, count, skip
  appcollowner = remove_appcollowner_dots(appcollowner)
  options = options || {}
  if (typeof idOrQuery == "string") {
    dbToUse(env_params).read_by_id(env_params, appcollowner, idOrQuery, function(err, object) {callback(err, (object? [object]:[]))})
  } else {
    let [err, well_formed] = [null, true] //todo fix // query_is_well_formed(idOrQuery)
    if (well_formed) {
      dbToUse(env_params).query(env_params, appcollowner, idOrQuery, options, callback)
    } else {
      callback(err)
    }
  }
}
exports.update = function (env_params, appcollowner, idOrQuery, updates_to_entity,
  options={replaceAllFields:false}, callback) {
  // assumes rights to make the update and that appcollowner is well formed
  // IMPORTANT: db_update cannot insert new entities - just update existign ones
    // options: replaceAllFields - replaces all object rather than specific keys
    // In replaceAllFields: dbtoUse needs to take _date_created from previous version and add it here
    // if old_entity is specified then it is done automatically... this assumes system generates the old_entity, not the user
  // restore_record: true

  //onsole.log("db_handler options",options)
  appcollowner = remove_appcollowner_dots(appcollowner)

  const uses_record_id = (typeof idOrQuery == "string" && idOrQuery.length>0)
  //const find = uses_record_id? {_id: idOrQuery }: idOrQuery;

  if (options && options.replaceAllFields) {
    if (options.old_entity) { // assumes system has found old_entity and so skip one extra find
      const entity_id = (typeof idOrQuery == "string")? idOrQuery : options.old_entity._id
      helpers.RESERVED_FIELD_LIST.forEach(key => {
        if (options.old_entity[key]) updates_to_entity[key] = options.old_entity[key]}
      )
      delete updates_to_entity._id
      updates_to_entity._date_modified = new Date().getTime();
      dbToUse(env_params).replace_record_by_id(env_params, appcollowner, entity_id, updates_to_entity, (err, result)=>{
        let returns = err? null : {
            nModified: result.nModified,
            _id: options.old_entity._id,
            _date_created: options.old_entity._date_created,
            _date_modified: updates_to_entity._date_modified
        }
        callback(err, returns)
      });
    } else {
      exports.query(env_params, appcollowner, idOrQuery, {}, (err, entities) => {
        if (!entities || entities.length==0) {
           callback(null, {nModified:0, n:0}) // todo make nModified consistent
        } else {
           let old_entity = entities[0];
           const entity_id = old_entity._id
           if (!options.restore_record) {
             helpers.RESERVED_FIELD_LIST.forEach(key => {
               if (old_entity[key]) updates_to_entity[key] = old_entity[key]}
             )
          }
           delete updates_to_entity._id
           updates_to_entity._date_modified = new Date().getTime();
           dbToUse(env_params).replace_record_by_id(env_params, appcollowner, entity_id, updates_to_entity, (err, result)=> {
             let returns = err? null : {
                 nModified: result,
                 _id: entity_id,
                 _date_created: old_entity._date_created,
                 _date_modified: updates_to_entity._date_modified
             }
             if(entities.length>1) {
               returns.more=true;
               returns.flags="More than one object retrieved - first object changed"
               console.warn("More than One object retrieved when updating with replaceAllFields ",find)
             }
             callback(err, returns)
           })
         }
      })
    }
  } else {  //if (!options.replaceAllFields)
    // todo - keeping default mongo return params pendign ceps definition
    if (!options.newSystemParams) helpers.RESERVED_FIELD_LIST.forEach(key => delete updates_to_entity[key])
    updates_to_entity._date_modified = new Date().getTime();
    dbToUse(env_params).update_multi_records(env_params, appcollowner, idOrQuery, updates_to_entity, options, callback);
  }
}
function updateFromOld(old_entity, updates_to_entity) {
  // note - must make sure system has remvoed RESERVED_FIELD_LIST
  for (let key in updates_to_entity) {
   if (updates_to_entity.hasOwnProperty(key)) {
     old_entity[key] = updates_to_entity[key]
   }
 }
 delete old_entity._id;
 return old_entity
}

exports.delete_record = function (env_params, appcollowner, idOrQuery, options, callback) {
    // No options at this point - reserved for future
    // Removes one or multiple items
    appcollowner = remove_appcollowner_dots(appcollowner)
    dbToUse(env_params).delete_record(env_params, appcollowner, idOrQuery, options, callback);
}

exports.upsert = function (env_params, appcollowner, idOrQuery, entity, callback) {
  // If multiple entites, only updates the first!! Does not work with multiple entities
  //onsole.log("db_handler.upsert")

  //onsole.log("in db_handler - upsert ",idOrQuery)

  function callFwd (err, existing_entity) {
    //onsole.log("In db_handler upsert callFwd", existing_entity)
    //onsole.log("Will replace with new entity", entity)
    if (err) {
      helpers.state_error("db_handler", exports.version, "upsert", err, "error reading db")
      cb(err)
    } else if (!existing_entity || (Array.isArray(existing_entity) && existing_entity.length==0)){
      let id =  (typeof idOrQuery == "string")? idOrQuery: (
                  (idOrQuery && idOrQuery._id)? (idOrQuery._id+"") : null
                )
      exports.create(env_params, appcollowner, id, entity, null, (err, result)=>{
        callback(err, ((result && result.entity)? result.entity : null))
      })
    } else  {
      if (Array.isArray(existing_entity)) {
        existing_entity=existing_entity[0];
      }
      delete entity._id;
      idOrQuery = existing_entity._id+""
      exports.update (env_params, appcollowner, idOrQuery, entity,
        options={replaceAllFields:true, old_entity:existing_entity },
        callback)
        // todo if returns nmodified==0, then throw error
    }
  };

  if (typeof idOrQuery== "string") {
    exports.read_by_id(env_params, appcollowner, idOrQuery, callFwd)
  } else {
    //onsole.log("in upsert doing first find for ",idOrQuery)
    exports.query(env_params, appcollowner, idOrQuery, {count:1}, callFwd)
  }
}

exports.getAllCollectionNames= function (env_params, user_id, app_name, callback) {
  app_name = app_name.replace(/\./g,"_")
  dbToUse(env_params).getAllCollectionNames (env_params, user_id, app_name, callback)
}

//CUSTOM ENV AND  ENV ACTIONS (ie SET UP etc)
exports.get_or_set_prefs = function (env_params, prefName, prefsToSet, doSet, callback) {
  //onsole.log("get_or_set_prefs Done for "+prefName+ "doset?"+doSet)
  //onsole.log(prefsToSet)
  let pref_on_db={}, err=null;

  const callFwd = function(err, write_result) {
      if (err) {
        console.warn("got err in getPrefs ",err)
        callback(err, prefsToSet)
      } else {callback(null, pref_on_db)}
  }
  exports.read_by_id(env_params, PARAMS_APC, prefName, (err, results)=> {
    if (err) {
      callFwd(err)
    } else if (!doSet && results) {
        pref_on_db = results;
        callFwd(null);;
    } else if (doSet && prefsToSet) {
        pref_on_db = prefsToSet
        if (results){
            console.warn("inserting new prefs ", pref_on_db)
            exports.update(env_params, PARAMS_APC, prefName, pref_on_db, {replaceAllFields:true, multi:false}, callFwd)
        } else {
            pref_on_db._id = prefName
            exports.create(env_params, PARAMS_APC, prefName, pref_on_db, null, callFwd)
        }
    } else if (doSet && !prefsToSet){
        callFwd(helpers.internal_error ("db_handler", exports.version, "get_or_set_prefs",( "doset is set to true but nothing to replace prefs "+prefName) ) )
    } else {
        callFwd(null);
    }
  })
}
exports.set_and_nulify_environment = function(env_params)  {
  if (dbToUse(env_params).set_and_nulify_environment) dbToUse(env_params).set_and_nulify_environment(env_params)
}
exports.write_environment = function(env_params, callback)  {
      // todo - write to collection of env and so keep a list of all envs for later review
      exports.upsert(env_params, PARAMS_APC, "freezr_environment", {params:env_params}, (err, write_result) =>{
          callback(err);
      })
}



// USER INTERACTIONS
exports.user_by_user_id = function (env_params, user_id, callback) {
    if (!user_id)
        callback(helpers.missing_data("user_id", "db_handler", exports.version, "user_by_user_id"));
    else
      admin_obj_by_unique_field (env_params, "info_freezr_admin","users", "user_id", exports.user_id_from_user_input(user_id), callback);
};
exports.all_users = function (env_params, callback) {
  exports.query(env_params, USERS_APC, null, {count:ARBITRARY_COUNT}, callback)
};
exports.changeUserPassword = function (env_params, user_id,password, callback) {

    async.waterfall([
        // validate params
        function (cb) {
            if (!user_id)
                cb(helpers.missing_data("user_id", "db_handler", exports.version,"changeUserPassword"));
            else if (!password)
                cb(helpers.missing_data("password", "db_handler", exports.version,"changeUserPassword"));
            else
                bcrypt.hash(password, 10, cb);
        },

        // UPDATE value in db
        function (hash, cb) {
          exports.update (env_params, USERS_APC,
            {user_id: user_id},
            {password: hash},
            {replaceAllFields:false},
            cb)
        }
    ],
    function (err, user_json) {
        if (err) {
            callback (err);
        } else {
            callback(null, user_json);
        }
    });
}

function admin_obj_by_unique_field (env_params, app_name, collection_name, field, value, callback) {
    let query = {};
    query[field] = value;
    const appcollowner = {
      app_name:app_name,
      collection_name:collection_name,
      owner:'fradmin'
    }
    exports.query(env_params, appcollowner, query, {}, (err, results) => {
        if (err) {
            callback(err, null, callback);
            return;
        }
        if (!results || results.length == 0) {
            callback(null, null, callback);
        } else if (results.length == 1) {
            callback(null, results[0], callback);
        } else {
            callback(helpers.internal_error("db_handler", exports.version, "admin_obj_by_unique_field", "multiple results where unique result expected" ), null, callback);
        }
    });
};

// USER_DEVICES and tokens

exports.set_or_update_user_device_code = function (env_params, device_code, user_id, single_app, user_agent, callback){
  // device_code, user_id and single_app together dfine user_device code so different apps hold different records
  let write = {
    'device_code':device_code,
    'user_id':user_id,
    single_app:single_app,
    user_agent:user_agent
  }
  const appcollowner = {
    app_name:'info_freezr_admin',
    collection_name:'user_devices',
    owner:user_id
  }
  //onsole.log("in db:handler set_or_update_user_device_code")
  exports.upsert (env_params, appcollowner,
    {'device_code':device_code, 'user_id':user_id, single_app:single_app},
    write,
    (err, results) => {
        if (err) {
            callback(err);
        } else {
            callback(null, {'device_code':device_code, 'single_app':single_app});
        }
    })
}

// app_tokens
const APP_TOKEN_APC = {
  app_name:'info_freezr_admin',
  collection_name:'app_tokens',
  owner:'fradmin'
}
let TOKEN_CACHE = {}
const EXPIRY_DEFAULT = 30*24*60*60*1000 //30 days
const generate_app_password = function(user_id, app_name, device_code){
  return helpers.randomText(20)
}
const generate_app_token = function(user_id, app_name, device_code){
  return helpers.randomText(50)
}
exports.get_or_set_app_token_for_logged_in_user = function (env_params, device_code, user_id,  app_name, callback) {
  exports.query(env_params, APP_TOKEN_APC, {user_id:user_id, app_name:app_name, user_device:device_code, source_device:device_code}, null,
    (err, results) => {
    const nowTime = (new Date().getTime())
    //onsole.log("get_or_set_app_token_for_logged_in_user",results)
    if (err) {
      callback(err);
    } else if (results && results.length>0 /*&& (results[0].expiry+(5*24*60*60*1000))>nowTime*/){ // re-issue 5 days before
      //onsole.log("sending back ",results[0])
      callback(null, results[0])
    } else {
      let record_id = (results && results[0] && results[0]._id)? (results[0]._id+""):null;
      let write = {
        'logged_in':true,
        'source_device':device_code,
        'user_id':user_id,
        'app_name':app_name,
        'app_password': null,
        'app_token': generate_app_token(user_id, app_name, device_code), // create token instead
        'expiry':(nowTime+ EXPIRY_DEFAULT),
        'user_device': device_code,
        'date_used': (record_id? results[0].date_used : nowTime)
      }
      const write_cb = function (err, results){
        //onsole.log("in write_cb, err is ",err,"results",results)
        if (err) {
          callback(err);
        } else {
          callback(null, {'success':true, 'app_name':app_name, app_token: write.app_token});
        }
      }
      if (record_id) {
        exports.update (env_params, APP_TOKEN_APC, record_id, write, {replaceAllFields:true}, write_cb)
      } else {
        exports.create (env_params, APP_TOKEN_APC, null, write, null,write_cb)
      }
    }
  })
}
exports.set_app_token_record_with_onetime_password = function (env_params, device_code, user_id, app_name, params, callback){
  if (!params) params={}
  if (!params.expiry) params.expiry = new Date ().getTime() + EXPIRY_DEFAULT
  params.one_device = (params.one_device===false)? false:true;
  let write = {
    'logged_in':false,
    'source_device':device_code,
    'user_id':user_id,
    'app_name':app_name,
    'app_password': generate_app_password(user_id, app_name, device_code),
    'app_token': generate_app_token(user_id, app_name, device_code), // create token instead
    'expiry':params.expiry,
    'one_device':params.one_device,
    'user_device': null,
    'date_used':null // to be replaced by date
  }
  exports.create (env_params, APP_TOKEN_APC, null,
    write, null,
    (err, results) => {
        if (err) {
            callback(err);
        } else {
            callback(null, {'success':true, 'app_name':app_name, app_password: write.app_password});
        }
    })
}
exports.get_app_token_onetime_pw_and_update_params = function(env_params, device_code, user_id,  app_name, password, params, callback) {
  exports.query(env_params, APP_TOKEN_APC, {app_password:password}, null,
    (err, results) => {
    if (err) {
      callback(err);
    } else if (!results || results.length==0){
      callback(helpers.error("no_results", "expected record but found none (get_app_token_onetime_pw_and_update_params)"))
    } else {
      let record = results[0]; // todo - theoretically there could be multiple and the right one need to be found
      if (record.user_id !=user_id || record.app_name != app_name) {
        console.warn(app_name, user_id, record)
        callback(helpers.error("mismatch", "app_name or user_id no not match expected value (get_app_token_record_using_pw)"))
      } else if (helpers.expiry_date_passed(record.expiry)){
        callback(helpers.error("password_expired","One time password has expired."))
      } else if (record.date_used){
        callback(helpers.error("password_used","Cannot change parameters after password has been used"))
      } else {
        changes = {}
        if (params.expiry) changes.expiry = params.expiry
        if (params.one_device || params.one_device===false) changes.one_device =  params.one_device;
        exports.update (env_params, APP_TOKEN_APC, (record._id+""), changes, {replaceAllFields:false},function(err, results) {
            if (err) {callback(err)} else {callback(null, record.app_token)}
          })
      }
    }
  })
}
exports.get_app_token_record_using_pw_and_mark_used = function(env_params, session_device_code, params, callback) {
  //onsole.log("get_app_token_record_using_pw",session_device_code, params)
  const {password, user_id, app_name, expiry} = params;

  exports.query(env_params, APP_TOKEN_APC, {app_password:password}, null,
    (err, results) => {
    //onsole.log("get_app_token_record_using_pw",results)
    if (err) {
      callback(err);
    } else if (!results || results.length==0){
      callback(helpers.error("no_results", "expected record but found none (get_app_token_record_using_pw)"))
    } else {
      let record = results[0]; // todo - theoretically there could be multiple and the right one need to be found
      //onsole.log(record,"user_id", user_id, "app_name", app_name)
      if (record.user_id !=user_id || record.app_name != app_name) {
        callback(helpers.error("mismatch", "app_name or user_id no not match expected value (get_app_token_record_using_pw)"))
      } else if (record.date_used){
        callback(helpers.error("password_used","One time password already in use."))
      } else if (helpers.expiry_date_passed(record.expiry)){
        callback(helpers.error("password_expired","One time password has expired."))
      } else {
        let expires_in = results[0].expiry;
        if (expiry && expiry<expires_in) expires_in = expiry
        exports.update (env_params, APP_TOKEN_APC, (record._id+""),
          {date_used:(new Date().getTime()), user_device:session_device_code, expiry:expires_in}, {},function(err, results) {
            if (err) {callback(err)} else {callback(null, record.app_token, expires_in)}
          })
      }
    }
  })
}
exports.find_token_from_cache_or_db = function (env_params, app_token, cb) {
  //onsole.log("finding ",app_token)
  if (TOKEN_CACHE [app_token] ) {
    cb(null, [TOKEN_CACHE[app_token] ])
  } else {
    exports.query(env_params, APP_TOKEN_APC, {app_token:app_token}, null, cb)
  }
}
exports.reset_token_cache = function(app_token){
  if (app_token) {
    delete TOKEN_CACHE[app_token]
  } else { // delete all
    TOKEN_CACHE={}
  }
}
exports.check_app_token_and_params = function(req, checks, callback) {
  let app_token = (req.header('Authorization') && req.header('Authorization').length>10)? req.header('Authorization').slice(7):null;
  if (!app_token) app_token = req.params.internal_query_token
  checks = checks || {}
  //onsole.log("check_app_token_and_params for "+app_token+" and app: "+checks.requestor_app)

  if (!app_token) {
    callback(helpers.error("tokem", "expected app_token but found none (check_app_token_and_params)"))
  } else {
    exports.find_token_from_cache_or_db(req.freezr_environment, app_token, (err, results) => {
      if (err) {
        callback(err);
      } else if (!results || results.length==0){
        callback(helpers.error("no_results", "expected record but found none (check_app_token_and_params)"))
      } else {
        let record = results[0]; // todo - theoretically there could be multiple and the right one need to be found
        const ARBITRARY_CACHE_MAX = 50;
        if (Object.keys(TOKEN_CACHE).length > ARBITRARY_CACHE_MAX) TOKEN_CACHE={}
        TOKEN_CACHE[app_token] = record;
        if (typeof checks.requestor_app == "string")  checks.requestor_app=[checks.requestor_app]
        if (!checks.requestor_app) checks.requestor_app=[]
        if (!record) {
          callback(helpers.error("mismatch", "record not found (check_app_token_and_params)"))
        } else if (!record.user_id || !record.app_name ) {
          callback(helpers.error("mismatch", "app_name or user_id or device_code do not match expected value (check_app_token_and_params)"), record)
        } else if (checks.user_id && record.user_id != checks.user_id ){
          callback(helpers.error("mismatch", "user_id does not match expected value (check_app_token_and_params) "), record)
        } else if (checks.requestor_app.length>0 && checks.requestor_app.indexOf(record.app_name)<0 ){
          callback(helpers.error("mismatch", "app_name does not match expected value (check_app_token_and_params) "), record)
        } else if (record.logged_in && record.user_id != req.session.logged_in_user_id ){
          callback(helpers.error("mismatch", "user_id does not match logged in (check_app_token_and_params) "), record)
        } else if (record.logged_in && checks.logged_in === false){
          callback(helpers.error("mismatch", "true token logged_in does not match logged in (check_app_token_and_params) "), record)
        } else if (record.one_device && record.user_device != req.session.device_code ){
          callback(helpers.error("mismatch", "one_device checked but device does not match (check_app_token_and_params) "), record)
        } else {
          //onsole.log("checking device codes ..", req.session.device_code, the_user, req.params.requestor_app)
          callback(err, record.user_id, record.app_name, record.logged_in)
        }
      }
    })
  }
}


// APP INTERACTIONS
exports.update_permission_records_from_app_config = function(env_params, app_config, app_name, user_id, flags, callback) {
    if (!app_config) {
        flags.add('notes','appconfig_missing');
        callback(null, flags)
    } else {
        // app_config exists - check it is valid
        // make a list of the schemas to re-iterate later and add blank permissions
        var app_config_permissions = (app_config && app_config.permissions && Object.keys(app_config.permissions).length > 0)? JSON.parse(JSON.stringify( app_config.permissions)) : null;
        //onsole.log("update_permission_records_from_app_config app_config.permissions:",app_config.permissions)
        var queried_schema_list = [], schemad_permission;
        for (var permission_name in app_config_permissions) {
            if (app_config_permissions.hasOwnProperty(permission_name)) {
                schemad_permission = exports.permission_object_from_app_config_params(app_name, app_config_permissions[permission_name], permission_name, app_name)
                queried_schema_list.push(schemad_permission);
            }
        }

        // For all users...
        exports.all_users(env_params, function (err, users) {
            async.forEach(users, function (aUser, cb) {
                async.waterfall ([

                    // 1. for each permission, get or set a permission record
                    function (cb) {
                        async.forEach(queried_schema_list, function (schemad_permission, cb) { // get perms
                            exports.permission_by_owner_and_permissionName(env_params, aUser.user_id,
                                schemad_permission.requestor_app,
                                schemad_permission.requestee_app_table,
                                schemad_permission.permission_name,
                                function(err, returnPerms) {
                                  //onsole.log("schemad_permission",schemad_permission, "returnPerms[0]",returnPerms[0])
                                    if (err) {
                                        cb(helpers.internal_error ("db_handler", exports.version, "update_permission_records_from_app_config","permision query error"));
                                    } else if (!returnPerms || returnPerms.length == 0) { // create new perm: schemad_permission.permission_name for aUser
                                        exports.create_query_permission_record(env_params, aUser.user_id, schemad_permission.requestor_app, schemad_permission.requestee_app_table, schemad_permission.permission_name, schemad_permission, null, cb)
                                    } else if (exports.permissionsAreSame(schemad_permission, returnPerms[0])) {
                                        cb(null);
                                    } else if (returnPerms[0].granted){
                                        exports.updatePermission(req.freezr_environment, returnPerms[0], "OutDated", null, cb);
                                    } else {
                                        // todo - really should also update the permissions
                                        cb(null);
                                    }
                                })
                        },
                        function (err) {
                            if (err) {
                                cb(err)
                            } else {
                                cb(null);
                            }
                        })
                    },

                ],function (err) {
                    if (err) { //err in update_app_config_from_file waterfall
                        cb(err);
                    } else {
                        cb();
                    }
                })
            },
            function (err) {
                if (err) {
                    if (!flags.error) flags.error = []; flags.error.push(err);
                    callback(null, flags)
                } else {
                    callback(null, flags);
                }
            })
        })

    }
}
exports.add_app = function (env_params, app_name, app_display_name, user_id, callback) {
    //onsole.log("add_app "+app_name+" "+app_display_name);
    async.waterfall([
        // 1 make sure data exists
        function (cb) {
            if (!app_name)
                cb(helpers.missing_data("app_name", "db_handler", exports.version,"add_app"));
            else if (!helpers.valid_app_name(app_name))
                cb(helpers.invalid_data("app_name: "+app_name, "db_handler", exports.version,"add_app"));
            else
                cb(null);
        },

        // 2. see if app already exists
        function (cb) {
            admin_obj_by_unique_field(env_params, "info_freezr_admin","installed_app_list", "app_name",app_name, cb);
        },

        // 3. stop if app already exists
        function (existing_app, arg2, cb) {
            if (existing_app) {
                cb(helpers.data_object_exists("app (add_app)"));
            } else {
                cb(null);
            }
        },

        // 4. create the app in the database.
        function (cb) {
            const write = {
                _id: app_name,
                app_name: app_name,
                installed_by: user_id,
                display_name: app_display_name
            };
            exports.create (env_params, APPLIST_APC, null, write, null, cb);
        },

        // todo later: Add permissions for app. who is allowed to use it etc?

        // fetch and return the new app.
        function (results, cb) {
            cb(null, results[0]);
        }
    ],
    function (err, app_json) {
        if (err) {
            callback(err);
        } else {
            callback(null, app_json);
        }
    });
};
exports.all_apps = function (env_params, options, callback) {
  options = options || {}
  dbToUse(env_params).query(env_params, APPLIST_APC,
    null, //query
    {skip:options.skip? options.skip:0, count:options.count || ARBITRARY_COUNT}, // options
    callback)
};
exports.all_user_apps = function (env_params, user_id, skip, count, callback) {
    if (!user_id) {
        callback(helpers.missing_data("User id", "db_handler", exports.version,"all_user_apps"))
    } else {
        const appcollowner = {
          app_name:'info_freezr_admin',
          collection_name:'user_installed_app_list',
          owner:user_id
        }
        dbToUse(env_params).query(env_params, appcollowner,
          {}, //query
          {skip:skip? skip:0, count:count? count:ARBITRARY_COUNT}, // options
          callback)
    }
};
exports.remove_user_app = function (env_params, user_id, app_name, callback){
    //onsole.log("removing app  for "+user_id+" app "+app_name);
    const req_id = user_id+'}{'+app_name
    const appcollowner = {
      app_name:'info_freezr_admin',
      collection_name:'user_installed_app_list',
      owner:user_id
    }
    USED_APP_LIST[req_id]=null
    exports.update (env_params, appcollowner,
      req_id, // query,
      {removed: true}, // updates_to_entity
      {replaceAllFields:false}, // options
      callback)
}
const USED_APP_LIST = {}
exports.mark_app_as_used = function (env_params, user_id, app_name, callback){
    //onsole.log("removing app  for "+user_id+" app "+app_name);
    const req_id = user_id+'}{'+app_name
    if (USED_APP_LIST[req_id]) {
      callback(null)
    } else {
      const rec = {app_name: app_name, user_id:user_id,removed: false}
      const appcollowner = {
        app_name:'info_freezr_admin',
        collection_name:'user_installed_app_list',
        owner:user_id
      }
      exports.upsert (env_params, appcollowner, req_id, rec, callback)
    }
}
exports.remove_user_records = function (env_params, user_id, app_name, callback) {
  // console 2020 - need to redo flow on this - eg get app_table names and then ask user to remove all app_tables
    var appDb, collection_names = [], other_data_exists = false;
    helpers.log (fake_req_from(user_id) ,("remove_user_records for "+user_id+" "+app_name));

    async.waterfall([
        // 1. get all collection names
        function (cb) {
            exports.getAllCollectionNames(env_params, user_id, app_name, cb);
        },

        // 2. for all colelctions, delete user data
        function (collection_names, cb){
            if (collection_names && collection_names.length>0) {
                //onsole.log("Coll names ",collection_names)
                var this_collection;

                async.forEach(collection_names, function (collection_name, cb2) {
                    const appcollowner = {
                      app_name:app_name,
                      collection_name:collection_name,
                      owner:user_id
                    }
                    async.waterfall([

                      function (cb3) {
                          exports.delete_record(env_params,appcollowner,{}, {}, cb3);
                      },

                      function (results, cb3)  {// removal results
                          exports.query(env_params,appcollowner,{}, {count:1}, cb2)
                      },

                      function(records, cb3) {
                          if (records && records.length>0) other_data_exists=true;
                          cb3(null);
                      }

                    ],
                    function (err) {
                        if (err) {
                            cb2(err);
                        } else {
                            cb2(null);
                        }
                    });
                },
                function (err) {
                    if (err) {
                        cb(err);
                    } else {
                        cb(null);
                    }
                })
            } else {
                cb(null);
            }
        }

        ],
        function (err) {
            if (err) {
                callback(err);
            } else {
                callback(null, {'removed_user_records':true , 'other_data_exists':other_data_exists});
            }

        });
}
exports.try_to_delete_app = function (env_params, logged_in_user, app_name, callback) {
    helpers.log (fake_req_from(logged_in_user) ,("going to try_to_delete_app "+app_name));
    var other_data_exists = false;
    async.waterfall([
        // validate params ad remvoe all user data
        function (cb) {
            if (!app_name){
                cb(helpers.missing_data("app_name", "db_handler", exports.version,"try_to_delete_app"));
            } else {
                exports.remove_user_records(env_params, logged_in_user, app_name, cb);
            }
        },

        // record if other people still have data
        function(results, cb) {
            other_data_exists = results.other_data_exists;
            cb(null)

        },

        // remove permissions
        function(cb) {
            exports.delete_record(env_params, PERMISSION_APC, {permitter:logged_in_user, requestor_app:app_name}, {}, cb);
        },

        // remove app directory
        function (results, cb) {
            if (!other_data_exists) {
                //onsole,log("going to deleteAppFolderAndContents")
                file_handler.deleteAppFolderAndContents(app_name, env_params, cb);
            } else {
                cb(null, null);
            }
        },

        function (cb) {

            if (!other_data_exists) {
              exports.delete_record(env_params, APPLIST_APC, {_id:app_name}, {}, cb);
            } else {
                cb(null, null);
            }
        },

        // also remove from user_installed_app_list
        function (results, cb) {
            if (!other_data_exists) {
              exports.delete_record(env_params, APPLIST_APC, {'_id':logged_in_user+'}{'+app_name}, {}, cb);
            } else {
                cb(null);
            }
        }


    ],
    function (err) {
        if (err) {
            callback(err);
        } else {
            callback(null, {'removed_user_records':true , 'other_data_exists':other_data_exists});
        }

    });
}
exports.get_app_info_from_db = function (env_params, app_name, callback) {
    admin_obj_by_unique_field (env_params, "info_freezr_admin","installed_app_list", "app_name", app_name, function (dummy, obj_returned){
        callback(null, obj_returned);
    });
}


// PERMISSIONS
// create update and delete
exports.create_query_permission_record = function (env_params, user_id, requestor_app, check_requestee_app_table, permission_name, schemad_permission, action, callback) {
    // must be used after all inputs above are veified as well as schemad_permission.collection
    // action can be null, "Accept" or "Deny"
    if (!user_id || !requestor_app || !permission_name || !schemad_permission.type) {
        callback(helpers.missing_data("query permissions", "db_handler", exports.version,"create_query_permission_record"));
    }
    var write = {
        requestor_app: requestor_app,        // Required
        requestee_app_table: check_requestee_app_table,       // Required ultimately
        type: schemad_permission.type, // Required
        permission_name: permission_name,             // Required
        description: schemad_permission.description? schemad_permission.description: permission_name,
        granted: false, denied:false, // One of the 2 are required
        outDated:false,
        permitter: user_id,                  // Required
        _date_created: new Date().getTime(),
        //_date_modified: new Date().getTime()
        permitted_fields: schemad_permission.permitted_fields? schemad_permission.permitted_fields: null,
        sharable_group : schemad_permission.sharable_group? schemad_permission.sharable_group: "self",
        return_fields   : schemad_permission.return_fields? schemad_permission.return_fields: null,
        anonymously     : schemad_permission.anonymously? schemad_permission.anonymously: false,
        search_fields   : schemad_permission.search_fields? schemad_permission.search_fields: null,
        sort_fields     : schemad_permission.sort_fields? schemad_permission.sort_fields: null, // todo later -  only 1 sort field can work at this point - to add more...
        max_count       : schemad_permission.count? schemad_permission.count: null,
    };

    if (!check_requestee_app_table) write.requestee_app_table = (schemad_permission.requestee_app || requestor_app) + (schemad_permission.collection_name? ("."+schemad_permission.collection_name) : '')

    if (write.type == "outside_scripts") {
        write.script_url = schemad_permission.script_url? schemad_permission.script_url : null;
    } else if (write.type == "web_connect") {
        write.web_url = schemad_permission.web_url? schemad_permission.web_url : null;
    }

    if (action) {
        if (action == "Accept") {
            write.granted = true;
        } else if (action == "Deny") {
            write.denied = true;
        }
    }
    if (write.requestee_app_table != check_requestee_app_table && write.requestee_app_table != (schemad_permission.requestee_app || requestor_app)+(schemad_permission.collection_name? ("."+schemad_permission.collection_name) : '') ) {
      callback("Incoinsistence requestee_app_table in create_query_permission_record ",check_requestee_app_table, requestor_app, schemad_permission.requestee_app, schemad_permission.collection_name )
    } else {
      exports.create (env_params, PERMISSION_APC, null, write, null, callback);
    }
}

exports.updatePermission = function(env_params, oldPerm, action, newPerms, callback) {
    // Note user_id, requestor_app, requestee_app_table, permission_name Already verified to find the right record.
    // action can be null, "Accept" or "Deny"
    //
    console.log("updatePermission "+action, oldPerm, newPerms)

    if (!oldPerm || !oldPerm._id || (action=="Accept" && !newPerms ) ) {
        callback(helpers.missing_data("permission data", "db_handler", exports.version, "updatePermission"))
    } else if (action == "OutDated") {
      exports.update (env_params, PERMISSION_APC,
        {_id: oldPerm._id+""},  //idOrQuery,
         {'OutDated':true}, // updates_to_entity
         {replaceAllFields:false},
         callback);
    } else  {
        if (action == "Accept") {newPerms.granted = true; newPerms.denied = false;newPerms.outDated=false}
        else if (action == "Deny") {newPerms.granted = false; newPerms.denied = true;newPerms.outDated=false}
        else {newPerms.granted = false; newPerms.denied = false;} // default - error

        newPerms.permitter = oldPerm.permitter

        exports.update (env_params, PERMISSION_APC,
          (oldPerm._id+""),  //idOrQuery,
          newPerms, // updates_to_entity
          {replaceAllFields:true},
          callback)
    }
}
exports.deletePermission = function (env_params, record_id, callback) {
    //
    exports.delete_record(env_params, PERMISSION_APC, record_id, {}, callback);
}
// queries
exports.all_userAppPermissions = function (env_params, user_id, app_name, callback) {
  console.warn("app_tables need to be defined first ie fetch app tables then find all")
    var dbQuery = {'$and': [{'permitter':user_id}, {'$or':[{'requestor_app':app_name}, {'requestee_app_table':app_name}]}]};
    exports.query(env_params, PERMISSION_APC, dbQuery, {}, callback)
}
exports.requestee_userAppPermissions = function (user_id, app_name, callback) {
    var dbQuery = {'$and': [{'permitter':user_id}, {'requestee_app':app_name}]};

    exports.query(env_params, PERMISSION_APC, dbQuery, {}, callback)
}
exports.permission_by_owner_and_permissionName = function (env_params, user_id, requestor_app, requestee_app_table, permission_name, callback) {
    //onsole.log("getting perms for "+user_id+" "+requestor_app+" "+requestee_app_table+" "+ permission_name)
    if (!user_id) {
        callback(helpers.missing_data("cannot get permission without user_id", "db_handler", exports.version,"permission_by_owner_and_permissionName"));
    } else if (!requestor_app) {
        callback(helpers.missing_data("cannot get permission without requestor_app", "db_handler", exports.version,"permission_by_owner_and_permissionName"));
    } else if (!requestee_app_table) {
        callback(helpers.missing_data("cannot get permission without requestee_app_table", "db_handler", exports.version,"permission_by_owner_and_permissionName"));
    } else if (!permission_name) {
        callback(helpers.missing_data("cannot get permission without permission_name", "db_handler", exports.version,"permission_by_owner_and_permissionName"));
    } else {
        const dbQuery = {'$and': [{"permitter":user_id},
                                  {'requestee_app_table':requestee_app_table},
                                  {'requestor_app':requestor_app},
                                  {'permission_name':permission_name}
                        ]};
        exports.query(env_params, PERMISSION_APC, dbQuery, {}, callback)
    }
}
exports.granted_permissions_by_owner_and_apps = function (env_params, user_id, requestor_app, requestee_app_table, callback) {
    //onsole.log("getting perms for "+user_id+" "+requestor_app+" "+requestee_app_table+" "+ permission_name)
    if (!user_id) {
        callback(helpers.missing_data("cannot get permission without user_id", "db_handler", exports.version,"permission_by_owner_and_permissionName"));
    } else if (!requestor_app) {
        callback(helpers.missing_data("cannot get permission without requestor_app", "db_handler", exports.version,"permission_by_owner_and_permissionName"));
    } else if (!requestee_app_table) {
        callback(helpers.missing_data("cannot get permission without requestee_app_table", "db_handler", exports.version,"permission_by_owner_and_permissionName"));
    } else {
        const dbQuery = {'$and': [{"permitter":user_id},
                                  {'requestee_app_table':requestee_app_table},
                                  {'requestor_app':requestor_app},
                                  {"granted":true}, {$or:[{"outDated":false}, {"outDated":null}] }
                        ]};
        exports.query(env_params, PERMISSION_APC, dbQuery, {}, callback)
    }
}
exports.permission_by_owner_and_objectId = function (user_id, requestee_app_table, collection_name, data_object_id, callback) {
    //onsole.log("getting perms for "+user_id+" "+requestor_app+" "+requestee_app_table+" "+ permission_name)
    const dbQuery = {'$and': [{"permitter":user_id}, {'requestee_app_table':requestee_app_table}, {'collection_name':collection_name}, {'data_object_id':data_object_id}]};
    exports.query(env_params, PERMISSION_APC, dbQuery, {}, callback)
}
exports.all_granted_app_permissions_by_name = function (env_params, requestor_app, requestee_app_table, permission_name, type, callback) {
  //onsole.log("all_granted_app_permissions_by_name searching perms ",'requestee_app_table',requestee_app_table,'requestor_app',requestor_app,'permission_name',permission_name)
  var dbQuery = {'$and': [{"granted":true}, {$or:[{"outDated":false}, {"outDated":null}] } ,   {'requestee_app_table':requestee_app_table}, {'requestor_app':requestor_app}, {'permission_name':permission_name}]};
  //var dbQuery {'$and': [{"granted":true}, {"outDated":false},  {'requestee_app_table':requestee_app_table}, {'requestor_app':requestor_app}, {'permission_name':permission_name}]};
  if (type) dbQuery.$and.push({"type":type})
  //onsole.log("all_granted_app_permissions_by_name ",dbQuery);
  exports.query(env_params, PERMISSION_APC, dbQuery, {}, callback)
  // todo - at callback also review each user's permission to make sure it's not outdated
}
// Checking permission similarity
const all_fields_to_check_for_permission_equality = ['type','requestee_app_table','collection', 'sort_fields','permission_name','sharable_group','allowed_user_ids','permitted_fields' ,'return_fields','max_count','permitted_folders'];
var fields_for_checking_query_is_permitted = ['type','requestor_app','requestee_app_table','collection','sort_fields','permission_name','sharable_group','allowed_user_ids','permitted_folders'];
// check if permitted
var queryParamsArePermitted = function(query, permitted_fields) {
    // go through query and strip out all params an then make sure they are in permitted fields
    //onsole.log("queryParamsArePermitted query "+JSON.stringify(query))
    //onsole.log("queryParamsArePermitted permitted_fields"+JSON.stringify(permitted_fields))
    if (!query || Object.keys(query).length == 0) {
        return true;
    } else if (!permitted_fields || Object.keys(permitted_fields).length == 0) {
        return true;
    } else {
        var queriedParams = getQueryParams(query);
        var allFieldsMatched = true;
        for (var i=0; i<queriedParams.length; i++) {
            if (!helpers.startsWith(queriedParams[i],'$') && permitted_fields.indexOf(queriedParams[i])<0) {
                allFieldsMatched = false;
            } // else exists "queriedParams[i] exists}
        }
        return allFieldsMatched;
    }
}
exports.queryIsPermitted = function(user_permission, query_schema, specific_params) {
    //// Permissions are held specifically for each users... so they actual permission given needs to be compared to the one in the app_config
    // specific params come from the body (q (query params))
    //onsole.log("queryIsPermitted userpermission" + JSON.stringify(user_permission) );
    //onsole.log("queryIsPermitted query_schema" +JSON.stringify(query_schema))
    //onsole.log("queryIsPermitted specific_params" +JSON.stringify(specific_params))

    if (!specific_params.count) specific_params.count = user_permission.max_count;
    if (!specific_params.skip) specific_params.skip = 0;
    return objectsAreSimilar(fields_for_checking_query_is_permitted, user_permission,query_schema)
        && queryParamsArePermitted(specific_params.q,user_permission.permitted_fields)
        && (!user_permission.max_count || (specific_params.count + specific_params.skip <= user_permission.max_count));
}
exports.fieldNameIsPermitted = function(requested_permission, permission_schema, field_name) {
    //// Permissions are held specifically for each users... so they actual permission given needs to be compared to the one in the app_config
    switch(permission_schema.type) {
        case 'field_delegate':
            return requested_permission.sharable_fields.indexOf(field_name)>=0;
            break;
        case 'folder_delegate':
            field_name = helpers.removeStartAndEndSlashes(field_name);
            if (requested_permission.sharable_folders && requested_permission.sharable_folders.length>0){
                for (var i = 0; i<requested_permission.sharable_folders.length; i++) {
                    if (helpers.startsWith(field_name, helpers.removeStartAndEndSlashes(requested_permission.sharable_folders[i]))) {
                        return true;
                    }
                }
            }
            return false;
            break;
        default: // Error - bad permission type
            return false;
    }
}
exports.field_requested_is_permitted = function(permission_model,requested_field_name, requested_field_value) {
    //onsole.log("field_requested_is_permitted" + JSON.stringify(permission_model))

    if (permission_model.type == "field_delegate") {
        return permission_model && permission_model.sharable_fields &&  permission_model.sharable_fields.indexOf(requested_field_name)>-1
    } else if (permission_model.type == "folder_delegate") {
        if (!permission_model.sharable_folders || permission_model.sharable_folders.length==0 || permission_model.sharable_folders.indexOf('/') >=0 ) {
            return true;
        } else {
            return file_handler.folder_is_in_list_or_its_subfolders(requested_field_value, permission_model.sharable_folders);
        }
    } else { // should not be here.
        return false;
    }
}
exports.permission_object_from_app_config_params = function(requestor_app, app_config_perm_params, permission_name, requestee_app) {
    var returnpermission = app_config_perm_params;
    if (!app_config_perm_params) return null;
    //onsole.log("permission_object_from_app_config_params app_config_perm_params - need to review todo 2020"+JSON.stringify(app_config_perm_params));

    returnpermission.permission_name = permission_name;
    returnpermission.requestor_app = requestor_app
    // old returnpermission.requestee_app_table =  app_config_perm_params.requestee_app_table || requestee_app
    if (app_config_perm_params.requestee_app_table){
      returnpermission.requestee_app_table =  app_config_perm_params.requestee_app_table
    } if (!requestee_app){
      console.warn("ERROR need to define-> app_config_perm_params",app_config_perm_params)
      console.warn("ERROR -> or define requestee_app",requestee_app)
      throw new Error("need equestee_app_table || requestee_app to be defined ",)
    } else {
      returnpermission.requestee_app_table =  requestee_app
      returnpermission.requestee_app_table += (app_config_perm_params.collection_name? ("."+app_config_perm_params.collection_name):"")

      return returnpermission;
    }
}
exports.permissionsAreSame = function (p1,p2) {
    //var sim = objectsAreSimilar(all_fields_to_check_for_permission_equality, p1,p2);
    //onsole.log("checking perm similarity ",p1,p2,"is similar? "+sim)
    return objectsAreSimilar(all_fields_to_check_for_permission_equality, p1,p2);
}

const query_is_well_formed = function(topquery) {
  // options include sort,limit and keyOnly
  // console 2020 - needs to be redone with new ceps rules
  console.warn("jan 2020 - need to redo for new appcollowner rules")
  let err = "";

  let top_ands = [];
  let theOrs=[];
  let oneOwner= null;

  let test_strings=[]

  const APPCOLL_OWNER="test_user"

  function getFirstKeyValue(obj, toplevel) {
    let i=1, ret=[null, null, null], err1 ="";
    Object.keys( obj ).forEach( key => {
      let part = {};
      if (i++ == 1) {
        if (typeof obj[key]!="string" && isNaN(obj[key])
            && !(toplevel==true && key=="$or" && Array.isArray(obj[key]) ) ) {
          //todo fix
          //err1 += " - Object cannot have multiple levels of queries"
        } else {
          ret= [key, obj[key], null]
        }
      } else {
        //todo fix
        //err1 += " - Object cannot have multiple levels of queries"
        //err1 += "Object contains more than one element (expected 1 for: "+JSON.stringify(obj)+")"
      }
    });
    if (err1) ret[2]=err1
    return ret;
  }

  // parse out top level $ands
  if (!topquery) {
    top_ands = []
  } else if (typeof topquery=="string") {
    // It is just an id
    top_ands = [topquery]
    oneOwner=APPCOLL_OWNER
  } else if (topquery.$and) {
    top_ands = topquery.$and
    let i=0, j=0;
    Object.keys( topquery ).forEach( key => {
      i++;
      if (key=="_owner") oneOwner=topquery[key]
    })
    topquery.$and.forEach(anAnd => {
      if (anAnd.$or) {
        j++;
        theOrs = anAnd.$or
      }
    })
    if(i>1 || j>1) err+=(" - All query params must be put into the top $and object")

  } else {
    Object.keys( topquery ).forEach( key => {
      if (key=="_owner") oneOwner=topquery[key]
      let part = {};
      part[key]=topquery[key]
      top_ands.push(part)
    });
    if (topquery.$or) {
      theOrs = topquery.$or
    }
  }
  if (theOrs.length==0) {
    theOrs=[{'_owner':oneOwner || APPCOLL_OWNER}]
  }

  for (let i=0; i<theOrs.length;i++) {
    let thisOwner = theOrs[i]._owner || oneOwner || APPCOLL_OWNER;
    test_strings[i] = "query string: ("+APPCOLL_OWNER+")"
  }

  const mongoCommands = ['$eq','$lt','$lte','$gt','$gte']
  top_ands.forEach((part)=> {
    let [key, value, err1] = getFirstKeyValue(part, true)
    if (err1) {
      err+= "Error on "+key+" "+err1
    } else if (key=='_id') {
       test_strings.forEach((a_string)=> {a_string += '(key='+value})
     } else if (key=='_owner') {
        // do nothing - already added
    } else if (key[0]=='$') { // a Mongo command
      if (key=='$or' && Array.isArray(value)) { // top level $or
        // do nothing
      } else if (mongoCommands.indexOf(key)>-1 ) { // allowed commands
        let idx = mongoCommands.indexOf(key)
        for (let i=0; i<theOrs.length;i++) {
          test_strings[i] +=".filter("+key+" : "+value +")"
        }
      } else {
        err+= "Error - Used "+key+" when accepted query commadns are "+JSON.stringify(mongoCommands)
      }
    } else {
      for (let i=0; i<theOrs.length;i++) {
        test_strings[i]+=".filter("+key+" = "+value +")"
      }
    }
  } )

  if (theOrs.length>0 &&
    !(theOrs.length==1 && theOrs[0]._owner)) // dont add owner filter so that one can sort
    {
    for (let i=0; i<theOrs.length;i++) {
      if (theOrs[i]){
        let [key, value, err2]=  getFirstKeyValue(theOrs[i], false)
        test_strings[i]+=".filter("+key+" = "+value +")"
      }
    }
  }

  if (err) {err = new Error(err)}
  if (err) console.warn("********** ERR : "+err)
  //onsole.log(test_strings)
  return [err, (!err)]
}


// GENERAL Admin db
exports.admindb_query = function (collection, options, callback) {
    //onsole.log("db_handler admindb_query")

    options = options || {};
    const appcollowner = {
      app_name:'info_freezr_admin',
      collection_name:collection,
      owner:'fradmin'
    }
    exports.query(env_params, appcollowner, options.q, {skip:(options.skip? options.skip: 0), count: (options.count? options.count:ARBITRARY_COUNT)}, callback)
};

// OTHER / OAUTH / MOVE TO ADMIN_DB
exports.all_oauths = function (include_disabled, skip, count, callback) {
  options = options || {};
  exports.query(env_params, OAUTHPERM_APC,
                  (include_disabled? {}:{enabled:true}),
                  {skip:(options.skip? options.skip: 0), count: (options.count? options.count:ARBITRARY_COUNT)},
                  callback)
};





// General comparison functions ...
const fake_req_from = function(user_id) {return {session:{logged_in_user_id:user_id}}}

var objectsAreSimilar = function(attribute_list, object1, object2 ) {
    // todo this is very simple - need to improve
    var foundUnequalObjects = false;
    //onsole.log("Checking similarity for 1:"+JSON.stringify(object1)+"  "+" VERSUS:  2:"+JSON.stringify(object2));
    for (var i=0; i<attribute_list.length; i++) {
        if ((JSON.stringify(object1[attribute_list[i]]) != JSON.stringify(object2[attribute_list[i]])) && (!isEmpty(object1[attribute_list[i]]) && !isEmpty(object2[attribute_list[i]]))) {
            console.warn("unequal objects found ",attribute_list[i]," for ", object1[attribute_list[i]] , " and ", object2[attribute_list[i]])
            // todo - improve checking for lists
            foundUnequalObjects=true;
        };
    }
    if (foundUnequalObjects) console.warn("foundUnequalObjects",object1,object2)
    return !foundUnequalObjects;
}
var object_attributes_are_in_list = function (attribute_list,anObject,checkObjectList) {
    foundsSimilar = false
    for (var i=0; i<checkObjectList.length; i++) {
        if (exports.objectsAreSimilar(attribute_list, anObject, checkObjectList[i] ) ) foundsSimilar = true;
    }
    return foundsSimilar;
}
var isEmpty = function(aThing) {
    //
    return !aThing
}
var getQueryParams = function(jsonQuery) {
    // parses a jsonObject string and gets all the keys of objects which represent the query fields in mongodb
    // also returns 'ands' and 'ors'
    tempret = [];
    if (typeof jsonQuery != "string" || isNaN(jsonQuery) ) {
        if (jsonQuery instanceof Array) {
            for (var i=0; i<jsonQuery.length; i++) {
                tempret = tempret.concat(getQueryParams(jsonQuery[i]));
            }
        } else if (typeof jsonQuery == "object") {
            for (var key in jsonQuery) {
                if (jsonQuery.hasOwnProperty(key)) {
                    tempret.push(key);
                    tempret = tempret.concat(getQueryParams(jsonQuery[key]));
                }
            }
        }
    }
    return tempret
}


// OTHER FUNCS TO REVIEW
// todo Consider moving to helpers
exports.user_id_from_user_input = function (user_id_input) {
    //
    return user_id_input? user_id_input.trim().toLowerCase().replace(/ /g, "_"): null;
};
