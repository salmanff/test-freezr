//

let confirm =null;


freezr.initPageScripts = function() {
  document.addEventListener('click', function (evt) {
    console.log('clicked'+evt.target.id+" path "+window.location.pathname);
    if (evt.target.id && evt.target.id=="confirm_permission") {
      changePermission(confirm, null, changePermissionCallBack)
    } else if (evt.target.id && evt.target.id=="close_window") {
      window.close()
    } else if (evt.target.id && freezr.utils.startsWith(evt.target.id,"freezerperm_") && freezr.utils.startsWith(window.location.pathname,"/account/perms/") ) {
      var parts = evt.target.id.split('_'); // freezerperm_{{requestee_app}}_{{permission_name}}_{{action}}
      let details= {requestor_app:parts[1],requestee_app:parts[2],action:parts[3] }
      details.permission_name=parts.slice(4).join("_")
      changePermission(details, evt.target, changePermissionCallBack)
    }


  });
  if (window.location.search) {
    // check have all params
    // do accept and on callback give message and hide confirm box and also switch the other permissions
    confirm = {}
    let parts = window.location.search.slice(1).split("&");
    parts.forEach(aPart => {
        let items = aPart.split('=');
        if(items.length>1) {confirm[items[0] ]= items[1]}
    })
    //onsole.log("path is "+window.location.pathname)
    parts =  window.location.pathname.split("/");
    confirm.requestee_app = parts[3]
    console.log(confirm)
    if (confirm.requestee_app && confirm.requestor_app && confirm.action && confirm.permission_name) {
      document.getElementById("confirm_title").innerHTML= (confirm.action=="Accept"? "Are you sure you want to grant this permission?":"Please confirm you want revoke this permission:")
      document.getElementById("confirm_app_name").innerHTML= confirm.requestor_app== confirm.requestee_app? ("App: "+confirm.requestor_app):("App: "+confirm.requestor_app+" is asking to access "+confirm.requestee_app)
      document.getElementById("confirm_permission_name").innerHTML= "Permission name: "+confirm.permission_name
      console.log("sentence_"+confirm.requestee_app+"_"+confirm.requestor_app+"_"+confirm.permission_name)
                                                                                  //sentence_org.mydata.yksi_org.mydata.yksi_publish_note
      document.getElementById("confirm_perm_sentence").innerHTML= document.getElementById("sentence_"+confirm.requestee_app+"_"+confirm.requestor_app+"_"+confirm.permission_name).innerHTML
      document.getElementById("confirm_dialogue").style.display="block"
    } else {
      showError("For confirmation, need requestee_app and permission_name and action")
    }
    if (confirm.window == "popup") {
      document.getElementById("adminFunctions").style.display="none"
      document.getElementById("freezerMenuButt").style.display="none"
    }
    window.history.pushState(null, null, '/account/perms/'+(confirm.requestee_app || ""));
  }
  setTimeout(freezer_restricted.menu.replace_missing_logos,2)
}



var showError = function(errorText) {
  var errorBox=document.getElementById("errorBox");
  errorBox.style="display:block"
  errorBox.innerHTML= errorText;
}


const changePermission = function(details, theButt, callback) {
    //onsole.log("CHANGE id"+buttonId+" permission_name"+permission_name+" "+ JSON.stringify(permission_object));
    console.log("changePermission details",details)
    if (!theButt) { //
      document.getElementById("confirm_dialogue_inner").style.display="none"
      document.getElementById("confirm_spinner").style.display="block"
      console.log("getting butt:"+"freezerperm_"+details.requestee_app+"_"+details.requestor_app+"_"+details.action+"_"+details.permission_name)
      theButt=document.getElementById("freezerperm_"+details.requestee_app+"_"+details.requestor_app+"_"+details.action+"_"+details.permission_name)
    }
    if (theButt) {
      theButt.innerHTML=". . . "
      theButt.className = "freezer_butt_pressed";
      theButt.id="freezerperm_"+details.requestee_app+"_"+details.requestor_app+"_pending_"+details.permission_name
      const url = '/v1/permissions/change/'+details.requestee_app;
      const data = {'changeList':[details]};
      freezer_restricted.connect.write(url, data, function(returnJson) {changePermissionCallBack(returnJson, details, theButt)});
    } else {
      showError("INTERNAL ERROR - Please try again")
    }
  }


const changePermissionCallBack = function(returnJson, details, theButt) {
    console.log('permission Callback ',returnJson);
    returnJson = freezer_restricted.utils.parse(returnJson);
    //document.getElementById("confirm_dialogue").style.display="none"
    if (returnJson.success) {
      const newAction = (details.action == "Accept")? "Deny":"Accept"
      theButt.innerHTML = newAction
      theButt.className = "freezer_butt"
      theButt.id = "freezerperm_"+details.requestee_app+"_"+details.requestor_app+"_"+newAction+"_"+details.permission_name
      showError((details.action == "Accept"? "Success!!! You have accepted the permission":"Success: You have revoked the permission"))
      let titles = ["confirm_title","confirm_spinner","confirm_app_name", "confirm_permission_name","confirm_perm_sentence","confirm_permission"]
      titles.forEach(aDivId => {document.getElementById(aDivId).style.display="none"})
      document.getElementById("confirm_dialogue_inner").style.display="block"
    } else {
      theButt.innerHTML = "Error";
      showError("There was an error changing this permission - please try again later")
    }
  }
