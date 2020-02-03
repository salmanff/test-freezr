
exports.version = "0.0.1";

var helpers = require('../helpers.js');

// makeAppCollOwner
AppCollOwner = function(app_or_app_table, options = { collection_name: null, owner:null, requestor_app:null, ignore_owner:false}) {
  let own_collection = null;
  let app_name=app_or_app_table

  if (typeof options == "string") options = {owner:options}

  if (!is_non_null_string(app_or_app_table)) throw new Error("appcollowner needs non null app_or_app_table")
  if (!is_non_null_string(options.owner) && !options.owner && !options.ignore_owner==true) throw new Error("appcollowner needs non null owner (or options.ignore_owner)")
  if (!is_string_or_null(options.collection_name) ) throw new Error("collection needs to be string or null")
  if (helpers.startsWith(app_or_app_table, options.requestor_app)) {
    own_collection=true;
    if (helpers.startsWith(app_or_app_table, options.requestor_app+".")) {
      app_name = options.requestor_app;
      if (options.collection_name) throw new Error ("appcollowner needs either a collection_name or an app_table not both")
      options.collection_name = app_or_app_table.slice(options.requestor_app.length+1)
    }
  } else {
    app_name = app_or_app_table;
    own_collection = (options.requestor_app)? false:undefined;
  }
  return {
    app_name:app_name,
    collection_name:options.collection_name,
    owner:options.owner,
    own_collection:own_collection
  }
}
const is_string = function(athing, nullokay) {return typeof athing == "string" || (nullokay && !athing)}
const is_string_or_null = function(athing) {return is_string(athing, true)}
const is_non_null_string = function(athing) {return is_string(athing) && athing.length>0}
//AppCollOwner.prototype.change_owner_to = function(new_owner) {this.owner = new_owner}

module.exports = AppCollOwner;
