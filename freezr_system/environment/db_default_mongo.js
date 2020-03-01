// freezr.info - nodejs system files - db_default_mongo.js
exports.version = "0.0.130"; // Changed names from db__main

// todo - remove concept of unifiedDB


var async = require('async'),
    helpers = require('../helpers.js'),
    MongoClient = require('mongodb').MongoClient,
    ObjectID = require('mongodb').ObjectID;

// State vars
var freezrdb = null;
let running_apps_db = {};

exports.name='Mongo Datastore'

const ARBITRARY_FIND_COUNT_DEFAULT = 100

// Initialisation
//Optional functions not implemented
  // exports.re_init_environment_sync = function(env_params) {}
  // exports.set_and_nulify_environment
  exports.re_init_freezr_environment = function(env_params, callback) {
    //onsole.log("in re_init_freezr_environment")
    const appcollowner = {
      app_name:'info_freezr_admin',
      collection_name : 'params',
      owner: 'fradmin'
    }
    get_coll(env_params, appcollowner, (err, collection) => {
      callback(err)})
  }
// Core functions
exports.create = function (env_params, appcollowner, id, entity, options, callback) {
  get_coll(env_params, appcollowner, (err, theCollection) =>{
    if(err) {
      callback(helpers.state_error ("db_default_mongo", exports.version, "create", err ))
    } else {
      if (id) entity._id = id;
      theCollection.insert(entity, { w: 1, safe: true }, (err, results) => {
        if (err) callback(err);
        else callback(null, {
            entity: (results.ops && results.ops.length>0)? results.ops[0]:null
        })
      });
    }
  })
}
exports.read_by_id = function (env_params, appcollowner, id, cb) {
  get_coll(env_params, appcollowner, function (err, theCollection) {
    if(err) {
      cb(helpers.state_error ("db_default_mongo", exports.version, "read_by_id", err ))
    } else {
      theCollection.find({ _id: get_real_object_id(id) }).toArray( (err, results) => {
        let object=null;
        if (err) {
          // TO helpers.error
          console.warn("error getting object for "+appcollowner.app_name+" or "+appcollowner.app_table+" id:"+id+" in read_by_id")
          helpers.state_error("db_default_mongo", exports.version, "read_by_id", err, "error getting object for "+appcollowner.app_name+" / "+appcollowner.app_table+" id:"+id+" in read_by_id");
        } else if (results && results.length>0 ){
          object = results[0]
        }
        cb(err, object);
      });
    }
  })
}
exports.query = function(env_params, appcollowner, query={}, options, cb) {
  if (query && query._id) query._id = get_real_object_id(query._id)
  get_coll(env_params, appcollowner, (err, theCollection) =>{
    if(err) {
      callback(helpers.state_error ("db_default_mongo", exports.version, "query", err ))
    } else {
      theCollection.find(query)
      .sort(options.sort || null)
      .limit(options.count || ARBITRARY_FIND_COUNT_DEFAULT)
      .skip(options.skip || 0)
      .toArray(cb);
    }
  })
}
exports.update_multi_records= function (env_params, appcollowner, idOrQuery, updates_to_entity, options, callback) {
  get_coll(env_params, appcollowner, (err, coll) =>{
    if(err) {
      callback(helpers.state_error ("db_default_mongo", exports.version, "update_multi_records", err ))
    } else {
      multi=true;
      if (typeof idOrQuery == "string") {
        idOrQuery={'_id': get_real_object_id(idOrQuery)}
        mutli=false
      } else if (idOrQuery._id) {
        idOrQuery._id = get_real_object_id(idOrQuery._id)
      }
      coll.update(idOrQuery, {$set: updates_to_entity}, { safe: true }, callback);
    }
  })
}
exports.replace_record_by_id = function (env_params, appcollowner, entity_id, updated_entity, callback) {
  get_coll(env_params, appcollowner, (err, coll) =>{
    if(err) {
      callback(helpers.state_error ("db_default_mongo", exports.version, "replace_record_by_id", err ))
    } else {
      coll.update({_id: get_real_object_id(entity_id)}, updated_entity, {safe: true  , multi:false }, callback)
    }
  })
};

exports.delete_record = function (env_params, appcollowner, idOrQuery, options={}, cb) {
  get_coll(env_params, appcollowner, (err, theCollection) =>{
    if(err) {
      callback(helpers.state_error ("db_default_mongo", exports.version, "read_by_id", err ))
    } else {
      if (typeof idOrQuery=="string") idOrQuery={"_id": get_real_object_id(idOrQuery)}
      theCollection.remove(idOrQuery, {multi:true}, cb);
    }
  })
}

exports.getAllCollectionNames = function(env_params, user_id, app_name, callback) {
    if (!running_apps_db[app_name]) running_apps_db[app_name]={'db':null, 'collections':{}};

    async.waterfall([
        // 1. open database connection
        function (cb) {
          if (freezrdb) {
            cb (null, null)
          } else {
            MongoClient.connect(dbConnectionString(env_params, db_name), (err, ret) => cb(err, ));
          }
        },

        // 2.
        function (theclient, cb) {
            if (!freezrdb) freezrdb = theclient.db(theclient.s.options.dbName)
            freezrdb.listCollections().toArray(cb);
        }

    ], function (err, nameObjList) {
        if (err) {
          callback(null, null);
        } else if (nameObjList  && nameObjList.length>0){
          var a_name, collection_names=[];
          if (nameObjList && nameObjList.length > 0) {
            nameObjList.forEach(function(name_obj) {
              a_name = name_obj.name;
              if (a_name && a_name!="system" && helpers.startsWith(a_name,app_name)) collection_names.push(a_name.slice(user_id.length+app_name.length+3));
            });
          }
          callback(null, collection_names);
        } else {
            callback(null, []);
        }
    });
}

// Background - Mongo specific Utilities
const get_real_object_id = function (data_object_id) {
    var real_id=data_object_id;
    if (typeof data_object_id=="string") {
      try {
        real_id = new ObjectID(data_object_id);
    } catch(e) {
        //console.warn("Could not get mongo real_id - using text id for "+data_object_id)
    }
  }
  return real_id
}
const full_name = function (appcollowner) {
  //onsole.log("full_name appcollowner ", appcollowner)
  if (!appcollowner) throw helpers.error("Mongo collection failure - need appcollowner ")
  const app_table = appcollowner.app_table || (appcollowner.app_name + (appcollowner.collection_name? ("_"+appcollowner.collection_name):"" ))
  //onsole.log("full_name appcollowner  app_table: "+ appcollowner.app_table + " app_name :"+appcollowner.app_name+" coll: "+appcollowner.collection_name)
  if (!app_table || !appcollowner.owner) throw helpers.error("NEDB collection failure - need app name and an owner for "+appcollowner.owner+"__"+appcollowner.app_name+"_"+appcollowner.collection_name)
  return (appcollowner.owner+"__"+app_table)
}
const get_coll = function(env_params, appcollowner, callback) {
  //onsole.log("get_coll in get_coll",appcollowner)
  db_name = full_name(appcollowner)
  if (running_apps_db[db_name] && running_apps_db[db_name].db) {
    callback(null, running_apps_db[db_name].db);
  } else {
    if (!running_apps_db[db_name]) running_apps_db[db_name]={'db':null, 'last_accessed':null};
    running_apps_db[db_name].last_access = new Date().getTime();

    async.waterfall([
        // 1. open database connection
        function (cb) {
          if (freezrdb) {
            cb (null, null)
          } else {
            MongoClient.connect(dbConnectionString(env_params, db_name), cb);
          }
        },
        // 2. create collections for users, installed_app_list, user_installed_app_list, user_devices, permissions.
        function (theclient, cb) {
          if (!freezrdb) freezrdb = theclient.db(theclient.s.options.dbName)
          freezrdb.collection(db_name, cb);
        }
    ], function(err, collection) {
        if (err) console.warn("error getting "+db_name+" in get_coll")
        running_apps_db[db_name].db = collection;
        callback(err, collection);
    });
  }
}
const dbConnectionString = function(env_params, dbName) {
  const DEFAULT_UNIFIED_DB_NAME = "freezrdb"
  const db_name = (env_params.dbParams && env_params.dbParams.unifiedDbName)? env_params.dbParams.unifiedDbName:DEFAULT_UNIFIED_DB_NAME
  var connectionString = ""
  /*
  if (env_params && env_params.dbParams && env_params.dbParams.host && env_params.dbParams.host=="localhost"  ) {
    return 'localhost/'+db_name;
  } else
  */
  if (env_params && env_params.dbParams) {
    if (env_params.dbParams.connectionString) {
      return env_params.dbParams.connectionString
    } else {
      connectionString+= 'mongodb://'
      if (env_params.dbParams.user) connectionString+= env_params.dbParams.user + ":"+env_params.dbParams.pass + "@"
      connectionString += env_params.dbParams.host + ":" + (env_params.dbParams.host == "localhost"? "" : env_params.dbParams.port)
      connectionString += "/"+ db_name  +(env_params.dbParams.addAuth? '?authSource=admin':'');
      return connectionString
    }
  } else {
    console.warn("ERROR - NO DB HOST")
    return null;
  }
}
