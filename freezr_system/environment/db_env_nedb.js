// freezr.info - nodejs databsse - sample custom_envioronments.js
// This can be used to create custom environments for accessing a custom db and file system
//
// custom environment for nedb


'use strict';

const Datastore = require('nedb');
const helpers = require('../helpers.js'),
      path = require('path'),
      async = require('async')

let freezr_environment = null;
let running_apps_db = {};
let autoCloseTimeOut = null;

const ARBITRARY_FIND_COUNT_DEFAULT = 100

exports.use = true;

exports.name='nedb Datastore'

exports.customDb = function(app_name) {return true}

exports.re_init_environment_sync = function(env_params) {
  freezr_environment = env_params;
  running_apps_db = {}
}
exports.re_init_freezr_environment = function(env_params, callback) {
  freezr_environment = env_params;
  running_apps_db = {}
  callback(null)
}
exports.check_db = function (env_params, callback) {
		//onsole.log("check_db in nedb")
    const appcollowner = {
      app_name:'info_freezer_admin',
		  collection_name : 'params',
      owner: 'freezr_admin'
    }
    let env_on_db=null;

    const coll = get_coll(env_params, appcollowner)

    exports.read_by_id(env_params, appcollowner, "freezr_environment", function(err, env_on_db) {
			exports.read_by_id(env_params, appcollowner, "test_write_id", (err2, savedData) => {
		    if (err || err2) {
		      console.warn("got err in check_db ",(err? err : err2))
        	callback((err? err : err2), env_on_db);
		    } else if (savedData){
          exports.update (env_params, appcollowner, "test_write_id", {'foo':'updated bar'},
            {}, (err, ret)=> callback(err, env_on_db))
		    } else {
          exports.create (env_params, appcollowner, "test_write_id", {'foo':'bar'}, null, (err, ret)=> callback(err, env_on_db))
        }
		});
	})
}
exports.create = function (env_params, appcollowner, id, entity, options, callback) {
  const coll = get_coll(env_params, appcollowner)
  if (id) entity._id = id;
  coll.insert(entity, function (err, newDoc) {   // Callback is optional
    // newDoc is the newly inserted document, including its _id
    // newDoc has no key called notToBeSaved since its value was undefined
    if (err) callback(err);
    else callback(null, {
      success:true,
      entity: newDoc
    })
  })
}
exports.read_by_id = function (env_params, appcollowner, id, cb) {
  const coll = get_coll(env_params, appcollowner)
  //onsole.log("in nedb read ",appcollowner," for ",id)
  coll.find({ '_id': id},  (err, results) => {
    let object=null;
    if (err) {
      // TO helpers.error
      console.warn("error getting object for "+app_name+" collection:"+collection_name+" id:"+id+" in read_by_id")
      helpers.state_error("db_env_nedb", exports.version, "read_by_id", err, "error getting object for "+appcollowner.app_name+" collection:"+appcollowner.collection_name+" id:"+id+" in read_by_id");
    } else if (results && results.length>0 ){
      object = results[0]
    }
    cb(err, object);
  });
}
exports.query = function(env_params, appcollowner, query, options, cb) {
  //onsole.log("in nedb db_find ",query, "options",options,"appcollowner",appcollowner)
  const coll = get_coll(env_params, appcollowner)
  coll.find(query)
      .sort(options.sort || null)
      .limit(options.count || ARBITRARY_FIND_COUNT_DEFAULT)
      .skip(options.skip || 0)
      .exec(cb);
}
exports.update = function (env_params, appcollowner, idOrQuery, updates_to_entity, options={}, cb) {
  // assumes rights to make the update and that appcollowner is well formed
  // IMPORTANT: db_update cannot insert new entities - just update existign ones
    // options: replaceAllFields - replaces all object rather than specific keys
    // In replaceAllFields: function needs to take _date_created from previous version and add it here
    // if options.old_entity is specified then it is done automatically... this assumes system generates the old_entity, not the user

    //onsole.log("db_update in nedb idOrQuery ",idOrQuery, "options",options)
    const coll = get_coll(env_params, appcollowner)
    const uses_record_id = (typeof idOrQuery == "string" && idOrQuery.length>0)
    const find = uses_record_id? {_id: idOrQuery }: idOrQuery;

    if (options.replaceAllFields) {
      if (!uses_record_id) {
        cb(new Error("cannot replaceallfields without specifying an id"))
      } else if (options.old_entity) {
        updates_to_entity._date_created = options.old_entity._date_created
        coll.update(find, updates_to_entity, {safe: true }, cb);
      } else {
        coll.find(find)
            .exec((err, entities) => {
             if (!entities || entities.length==0) {
               cb(null, {nModified:0, n:0}) // todo make nModified consistent
             } else {
               let old_entity = entities[0];
               updates_to_entity._date_created = old_entity._date_created
               coll.update(find, updates_to_entity, {safe: true }, cb);
             }
           })
       }
    } else {  //if (!options.replaceAllFields)
      delete updates_to_entity._date_created
      coll.update(find, {$set: updates_to_entity}, { safe: true , multi:uses_record_id }, cb);
    }
}

exports.replace_record_by_id = function (env_params, appcollowner, id, updates_to_entity, cb) {
  const coll = get_coll(env_params, appcollowner)
  coll.update({_id: id }, updates_to_entity, {safe: true, multi:false }, (err, result) =>{
    if (err){
      cb(err)
    } else if (result == 1) {
      updates_to_entity._id = id;
      cb(null, {entity:updates_to_entity})
    } else {
      cb(new Error("error updating record"))
    }
  });
}

exports.delete_record = function (env_params, appcollowner, idOrQuery, options={}, cb) {
  const coll = get_coll(env_params, appcollowner)
  if (typeof idOrQuery=="string") idOrQuery={"_id":idOrQuery}
  coll.remove(idOrQuery, {multi:true}, cb);
}

exports.set_and_nulify_environment = function(old_env) {
    freezr_environment = old_env;
}

exports.getAllCollectionNames = function(env_params, app_name, callback) {
  //onsole.log("getting coll names for ",app_name)
  const db_folder = env_params.dbParams.db_path + path.sep;
  const fs = require('fs');
  let list = []
  fs.readdir(db_folder, (err, files) => {
    files.forEach(file => {
      if (helpers.startsWith(file, app_name)) list.push(file.slice(app_name.length+2,-3) )
    });
    callback(null, list)
  });
}

function get_coll(env_params, appcollowner) {
    //onsole.log("get_coll in get_coll",appcollowner)
    if (running_apps_db[full_name(appcollowner)] && running_apps_db[full_name(appcollowner)].db) return running_apps_db[full_name(appcollowner)].db
    if (!running_apps_db[full_name(appcollowner)]) running_apps_db[full_name(appcollowner)]={'db':null, 'last_accessed':null};
    let coll_meta = running_apps_db[full_name(appcollowner)]
    coll_meta.last_access = new Date().getTime();
    coll_meta.db = new Datastore(env_params.dbParams.db_path + path.sep + full_name(appcollowner)+'.db');
    coll_meta.db.loadDatabase()
    clearTimeout(autoCloseTimeOut);
    autoCloseTimeOut = setTimeout(exports.closeUnusedApps,30000);
    return coll_meta.db
}
const full_name = function (appcollowner) {
  //onsole.log("full_name appcollowner ", appcollowner)
  if (!appcollowner) throw helpers.error("NEDB collection failure - need appcollowner ")
  const app_table = appcollowner.app_table || (appcollowner.app_name + (appcollowner.collection_name? ("_"+appcollowner.collection_name):"" ))
  //onsole.log("full_name appcollowner  app_table: "+ appcollowner.app_table + " app_name :"+appcollowner.app_name+" coll: "+appcollowner.collection_name)
  if (!app_table || !appcollowner.owner) throw helpers.error("NEDB collection failure - need app name and an owner for "+appcollowner.owner+"__"+appcollowner.app_name+"_"+appcollowner.collection_name)
  return (appcollowner.owner+"__"+app_table)
}
exports.closeUnusedApps = function() {
    //onsole.log("closeUnusedApps...")
    var unusedAppsExist = false;
    const closeThreshold = 20000;
    for (var oneAppName in running_apps_db) {
        if (running_apps_db.hasOwnProperty(oneAppName) && running_apps_db[oneAppName]) {
            if (!running_apps_db[oneAppName].last_access || (new Date().getTime()) - running_apps_db[oneAppName].last_access  > closeThreshold) {
                running_apps_db[oneAppName].db = null;
                if (running_apps_db[oneAppName].db) delete running_apps_db[oneAppName];
            }
        }
        for (var twoAppName in running_apps_db) {
            if (running_apps_db.hasOwnProperty(twoAppName) ) {
                unusedAppsExist = true;
                //onsole.log("unclosed dbs are "+twoAppName+" diff "+((running_apps_db[twoAppName] && running_apps_db[twoAppName].last_access)? (new Date().getTime() - running_apps_db[twoAppName].last_access ): "no last acces") )
            }
        }
    }
    clearTimeout(autoCloseTimeOut);
    if (unusedAppsExist) autoCloseTimeOut = setTimeout(exports.closeUnusedApps,30000);
}
