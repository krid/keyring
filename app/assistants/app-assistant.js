/**
 * @author Dirk Bergstrom
 * 
 * Keyring for webOS - Easy password management on your phone.
 * Copyright (C) 2009, Dirk Bergstrom, keyring@otisbean.com
 *     
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var Keyring = {};

Keyring.version = "0.0.1";

//Setup App Menu for all scenes; all menu actions handled in
//AppAssistant.handleCommand()
Keyring.MenuAttr = {omitDefaultItems: true};

Keyring.MenuModel = {
    visible: true,
    items: [ 
        {label: $L("About Keyring..."), command: "do-aboutKeyring"},
        Mojo.Menu.editItem,
        {label: $L("Actions..."), command: "do-keyRingActions"},    
        {label: $L("Preferences..."), command: "do-keyRingPrefs"},    
        {label: $L("Help..."), command: "do-keyRingHelp"}            
    ]
};

function AppAssistant(controller) {
	this.appController = controller;
}

AppAssistant.prototype.setup = function() {
	this.ring = new Ring();
    // Read version number from appinfo.json file
    var file = Mojo.appPath + 'appinfo.json';
    Mojo.Log.info("Reading appinfo.json from", file);
    fileAJAX = new Ajax.Request(file, {
	    method: 'get',
	    parameters: '',
	    evalJSON: 'force',
	    onSuccess: this.fileReadCallback.bind(this),
	    onFailure: function() { Mojo.Log.error("Failed to read appinfo.json"); }
    });
};

AppAssistant.prototype.fileReadCallback = function(transport) {
	var Resp = transport.responseJSON;
	Keyring.version = Resp.version;
};

AppAssistant.prototype.windowDeactivated = function() {
	// TODO consider making this optional via prefs.
	this.ring.clearPassword();
};

AppAssistant.prototype.handleLaunch = function() {
	// This function is required for a light-weight application to be
	// able to open a window of its own. It is not required if the app
	// is always launched from another application cross-app.
	this.openChildWindow(this.appController);
};

AppAssistant.prototype.openChildWindow = function() {
	this.stageController = this.appController.getStageController('lightWeight');
	if (this.stageController){
		// app window is open, give it focus
		Mojo.Log.info("give open window focus");
		this.stageController.activate();
	} else{
		// otherwise create the app window
		Mojo.Log.info("create app window");
		this.appController.createStageWithCallback({name: 'lightWeight', lightweight: true},
				this.pushOpeningScene.bind(this));		
	}

};

AppAssistant.prototype.pushOpeningScene = function(stageController) {
	Mojo.Event.listen(stageController.document,
			Mojo.Event.stageDeactivate, this.windowDeactivated.bind(this));
	stageController.pushScene('item-list', this.ring);
};

//-----------------------------------------
//handleCommand - called to handle app menu selections
// 
AppAssistant.prototype.handleCommand = function(event) {    
	var stageController = this.controller.getActiveStageController();
	var currentScene = stageController.activeScene();

	if(event.type == Mojo.Event.command) {
	    switch(event.command) {
	        case "do-aboutKeyring":
	        	this.ring.updateTimeout();
	            currentScene.showAlertDialog({
	                onChoose: function(value) {},
	                title: $L("Keyring — Easy password management"),
	                message: $L("Version #{version}\nCopyright 2009, Dirk Bergstrom.\nReleased under the GPLv3.").interpolate({version: Keyring.version}),
	                choices:[{label:$L("OK"), value:""}]
	            });
	        break;
	         
	        case "do-keyRingPrefs":
	        	Keyring.doIfPasswordValid(currentScene, this.ring,
					stageController.pushScene.
					bind(stageController, "preferences", this.ring)
				);
        	break;
	         
	        case "do-keyRingActions":
	        	Keyring.doIfPasswordValid(currentScene, this.ring,
					stageController.pushScene.
					bind(stageController, "actions", this.ring)
				);
        	break;
	        	
	        case "do-keyRingHelp":
	        	this.ring.updateTimeout();
	            stageController.pushScene("help", this.ring);
	        break;
	    }
	}
};

/*
 * The "Enter your password" dialog, used throughout the application.
 */
PasswordDialogAssistant = Class.create ({
	initialize: function(controller, ring, callback) {
		this.controller = controller;
	    this.ring = ring;
	    this.callbackOnSuccess = callback;
	},

	setup: function(widget) {
	    this.widget = widget;
	    
	    this.controller.get("password-title").update($L("Unlock"));
	        
	    this.controller.setupWidget(
	        "password",
	        {
	              hintText: $L("Password"),
	              autoFocus: true,
	              changeOnKeyPress: true,
	              limitResize: true,
	              autoReplace: false,
	              textCase: Mojo.Widget.steModeLowerCase,
	              enterSubmits: true,
	              requiresEnterKey: true
	        },
	        this.passwordModel = {value: ''});
	
	    this.controller.listen("password", Mojo.Event.propertyChange,
	        this.keyPressHandler.bind(this));
	    
	    this.unlockButtonModel = {label: $L("Unlock"), disabled: false};
	    this.controller.setupWidget("unlockButton", {type: Mojo.Widget.activityButton},
	        this.unlockButtonModel);
	    this.unlockButtonActive = false;
	    this.unlockButton = this.controller.get("unlockButton");
	    this.unlockHandler = this.unlock.bindAsEventListener(this);
	    this.controller.listen("unlockButton", Mojo.Event.tap,
	        this.unlockHandler);
	      
	    this.cancelButtonModel = {label: $L("Cancel"), disabled: false};
	    this.controller.setupWidget("cancelButton", {type: Mojo.Widget.defaultButton},
	        this.cancelButtonModel);
	    this.controller.listen("cancelButton", Mojo.Event.tap,
	    	this.widget.mojo.close);
	},
	
	keyPressHandler: function(event) {
		if (Mojo.Char.isEnterKey(event.originalEvent.keyCode)) {
		    this.unlock();
		}
	},

	unlock: function() {
		Mojo.Log.info("unlock");
		if (this.ring.validatePassword(this.passwordModel.value)) {
			Mojo.Log.info("Password accepted");
			this.widget.mojo.close();
			this.callbackOnSuccess();
		} else {
			Mojo.Log.info("Bad Password");
			// TODO select random insult from the sudo list
			// FIXME apply some decent styling to the error message
			// FIXME set focus on password input
			this.controller.get("errmsg").update($L("==> Invalid Password <=="));
			this.controller.get("password").focus();
		}
	},

	//cleanup  - remove listeners
	cleanup: function() {
		this.controller.stopListening("unlockButton", Mojo.Event.tap,
		    this.unlockHandler);
		this.controller.stopListening("cancelButton", Mojo.Event.tap,
		    this.widget.mojo.close);
		this.controller.stopListening("password", Mojo.Event.propertyChange,
	        this.keyPressHandler.bind(this));
	}
});

/* If the user has entered a valid password within the timeout window, or they
 * enter it into the dialog, return true. */
Keyring.doIfPasswordValid = function(sceneController, ring, callback) {
	if (ring.passwordValid()) {
		callback();
	} else {
		sceneController.showDialog({
			template: "password-dialog",
			assistant: new PasswordDialogAssistant(sceneController, ring, callback)
		});
	}
};



