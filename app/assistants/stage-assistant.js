/**
 * @author Dirk Bergstrom
 * 
 * Keyring for webOS - Easy password management on your phone.
 * Copyright (C) 2009-2010, Dirk Bergstrom, keyring@otisbean.com
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

//Setup App Menu for all scenes; all menu actions handled in
//AppAssistant.handleCommand()
Keyring.MenuAttr = {omitDefaultItems: true};

Keyring.MenuModel = {
    visible: true,
    items: [ 
        {label: $L("About Keyring..."), command: "do-aboutKeyring"},
        Mojo.Menu.editItem,
        {label: $L("Edit Categories..."), command: "do-keyRingCategories"},    
        {label: $L("Database Actions..."), command: "do-keyRingActions"},    
        {label: $L("Preferences..."), command: "do-keyRingPrefs"},    
        {label: $L("Help..."), command: "do-keyRingHelp"}            
    ]
};

function StageAssistant() {
}

StageAssistant.prototype.setup = function() {
	this.ring = new Ring();
	Keyring.version = Mojo.appInfo.version;
	Mojo.Event.listen(document,
		Mojo.Event.stageDeactivate, this.windowDeactivated.bind(this));
	Mojo.Event.listen(document,
			Mojo.Event.stageActivate, this.windowActivated.bind(this));
	this.controller.pushScene('locked', this.ring);
};

StageAssistant.prototype.windowActivated = function() {
	Mojo.Log.info("windowActivated in scene", this.controller.topScene().sceneName);
	if (this.cancelIdleLockoutId) {
		window.clearTimeout(this.cancelIdleLockoutId);
	}
	this.cancelIdleLockoutId = false;
};

StageAssistant.prototype.windowDeactivated = function() {
	var scene = this.controller.topScene();
	Mojo.Log.info("windowDeactivated in scene", scene.sceneName);
	switch (this.ring.prefs.onDeactivate) {
		case 'lock':
			Keyring.lockout(this.controller, this.ring);
			break;
		case 'lockSoon':
			this.cancelIdleLockoutId =
				Keyring.lockout.delay(this.ring.lockSoonDelay, this.controller, this.ring);
			break;
		default:
			// noLock, do nothing
	}
};

/**
 * handleCommand - called to handle app menu selections
*/ 
StageAssistant.prototype.handleCommand = function(event) {    
	var currentScene = this.controller.activeScene();

	if(event.type == Mojo.Event.command) {
	    switch(event.command) {
	        case "do-aboutKeyring":
	        	this.ring.updateTimeout();
	            currentScene.showAlertDialog({
	                onChoose: function(value) {},
	                title: $L("Keyring — Easy password management"),
	                message: $L("Version #{version}\nCopyright 2009-2010, Dirk Bergstrom.\nReleased under the GPLv3.").interpolate({version: Keyring.version}),
	                choices:[{label:$L("OK"), value:""}]
	            });
	        break;
	         
	        case "do-keyRingPrefs":
	        	Keyring.doIfPasswordValid(currentScene, this.ring,
					this.controller.pushScene.
					bind(this.controller, "preferences", this.ring)
				);
        	break;
	         
	        case "do-keyRingActions":
	        	Keyring.doIfPasswordValid(currentScene, this.ring,
					this.controller.pushScene.
					bind(this.controller, "actions", this.ring)
				);
        	break;
	        	
	        case "do-keyRingCategories":
	        	Keyring.doIfPasswordValid(currentScene, this.ring,
	        			this.controller.pushScene.
	        			bind(this.controller, "categories", this.ring)
	        	);
	        	break;
	        	
	        case "do-keyRingHelp":
	        	this.ring.updateTimeout();
	            this.controller.pushScene("help", this.ring);
	        break;
	    }
	}
};

/*
 * The "Enter your password" dialog, used throughout the application.
 */
PasswordDialogAssistant = Class.create ({
	initialize: function(controller, ring, callback, noCancel) {
		this.controller = controller;
	    this.ring = ring;
	    this.callbackOnSuccess = callback;
	    this.noCancel = noCancel ? true : false;
	},

	setup: function(widget) {
	    this.widget = widget;
	    
	    this.controller.get("password-title").update($L("Enter Password to Unlock"));
	        
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
	    this.controller.setupWidget("unlockButton", {type: Mojo.Widget.defaultButton},
	        this.unlockButtonModel);
	    this.unlockHandler = this.unlock.bindAsEventListener(this);
	    this.controller.listen("unlockButton", Mojo.Event.tap,
	        this.unlockHandler);
	    
	    if (! this.noCancel) {
		    this.cancelButtonModel = {label: $L("Cancel"), disabled: false};
		    this.controller.setupWidget("cancelButton", {type: Mojo.Widget.defaultButton},
		        this.cancelButtonModel);
		    this.controller.listen("cancelButton", Mojo.Event.tap,
		    	this.widget.mojo.close);
	    }
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
			this.controller.get("errmsg").update($L("Invalid Password"));
			this.controller.get("password").mojo.focus.delay(0.25);
		}
	},

	//cleanup  - remove listeners
	cleanup: function() {
		this.controller.stopListening("unlockButton", Mojo.Event.tap,
		    this.unlockHandler);
		if (! this.noCancel) {
			this.controller.stopListening("cancelButton", Mojo.Event.tap,
				this.widget.mojo.close);
		}
		this.controller.stopListening("password", Mojo.Event.propertyChange,
	        this.keyPressHandler.bind(this));
	}
});

/* If the user has entered a valid password within the timeout window, or they
 * enter it into the dialog, return true. */
Keyring.doIfPasswordValid = function(sceneController, ring, callback, preventCancel) {
	if (ring.passwordValid()) {
		callback();
	} else {
		sceneController.showDialog({
			template: "password-dialog",
			preventCancel: preventCancel ? true : false,
			assistant: new PasswordDialogAssistant(sceneController, ring,
				callback, preventCancel)
		});
	}
};

/* Called by scenes on timeout or app deactivation/minimization. */
Keyring.lockout = function(stageController, ring) {
	var sceneName = stageController.topScene().sceneName;
	Mojo.Log.info("Timeout or Deactivate in scene", sceneName);
	ring.clearPassword();
	if (ring.prefs.lockoutTo == 'close-app') {
		stageController.popScenesTo('locked');
	} else if (sceneName != ring.prefs.lockoutTo) {
		// Don't pop scene if we're already on the lockoutTo page.
		stageController.popScenesTo(ring.prefs.lockoutTo);
	}
};

Keyring.activateLockout = function(sceneAssistant) {
	Mojo.Log.info("activateLockout for scene",
		sceneAssistant.controller.stageController.topScene().sceneName);
	// Clear password after idle timeout
	sceneAssistant.cancelIdleTimeout = sceneAssistant.controller.setUserIdleTimeout(
		sceneAssistant.controller.sceneElement,
		Keyring.lockout.bind(Keyring, sceneAssistant.controller.stageController, sceneAssistant.ring),
		sceneAssistant.ring.prefs.timeout);
};


Keyring.deactivateLockout = function(sceneAssistant) {
	Mojo.Log.info("deactivateLockout for scene",
		sceneAssistant.controller.stageController.topScene().sceneName);
	sceneAssistant.cancelIdleTimeout();
};
