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

function LockedAssistant(ring) {
	this.ring = ring;
	this.startupComplete = false;
}

LockedAssistant.prototype.setup = function() {
	Keyring.log("LockedAssistant.setup()");
	this.loadingMessage = this.controller.get("loading-mesg").update($L("Initializing..."));
	this.controller.setupWidget("loading-spinner",
         {spinnerSize: Mojo.Widget.spinnerSmall},
         this.spinnerModel = {
             spinning: true 
         });
	
	// Start the Depot data read process
	this.ring.initDepotReader(this.loaded.bind(this));
};

/**
 * This method is passed to the data loading chain of our Ring as a callback.
 * It's called when the Depot load is finished and the app is ready for
 * user interaction. 
 */
LockedAssistant.prototype.loaded = function(errmsg) {
	Keyring.log("LockedAssistant.loaded(), errmsg=%s", errmsg);
	this.spinnerModel.spinning = false;
	this.controller.modelChanged(this.spinnerModel);
	if (errmsg) {
		this.loadingMessage.update($L("Error: ") + errmsg);		
	} else {
		// The ring is loaded, get rid of the "Loading..." message
		this.loadingMessage.update($L("Ready"));
		this.controller.get("img-div").update('<img src="images/lock.png"/>');
		this.requestPassword();
	}
};

/**
 * Display a password dialog.  If this is the first run, it'll be "create
 * master password", otherwise it's "enter password to unlock".
 * We get here on timeout/deactivate as well as at launch.
 */
LockedAssistant.prototype.requestPassword = function() {
	if (this.ring.firstRun) {
		// User has not yet set a master password
		this.loadingMessage.update($L("Set initial password"));
	    this.controller.showDialog({
	        template: "locked/new-password-dialog",
	        preventCancel:true,
	        assistant: new NewPasswordDialogAssistant(this, this.ring,
        		this.pushToItemList.bind(this))
	    });
	    
	} else {
		Keyring.doIfPasswordValid(this.controller, this.ring,
				this.pushToItemList.bind(this), true);	
	}
};

/**
 * Password has been validated, go to the item list.  First, note that app
 * startup is complete, and change the message, so that when this scene is
 * activated again, we'll be ready.
 */
LockedAssistant.prototype.pushToItemList = function() {
	this.startupComplete = true;
	this.loadingMessage.update($L("Keyring open"));
	this.controller.get("img-div").update('<img src="images/open-lock.png"/>');
	this.controller.stageController.pushScene("item-list", this.ring);
};

/**
 * This scene is loaded at app startup, but when that happens the Ring is
 * still loading data, so we need to wait.  Later, the scene is used whenever
 * the app is "locked out", and at that time, we need to put up the "enter
 * password" dialog.
 */
LockedAssistant.prototype.activate = function(event) {
	if (this.startupComplete) {
		this.ring.clearPassword();
		this.loadingMessage.update($L("Keyring locked"));
		this.controller.get("img-div").update('<img src="images/lock.png"/>');
		if (this.ring.prefs.lockoutTo === 'close-app') {
			Keyring.log("Closing Keyring on lockout.");
			window.close();
		} else {
			this.requestPassword();
		}
	}
};

LockedAssistant.prototype.deactivate = function(event) {
};

LockedAssistant.prototype.cleanup = function(event) {
};


/*
 * The dialog used to set the initial password.
 */
function NewPasswordDialogAssistant(sceneAssistant, ring, callback) {
	this.sceneAssistant = sceneAssistant;
	this.ring = ring;
	this.callbackOnSuccess = callback;
}

NewPasswordDialogAssistant.prototype.setup = function(widget) {
	this.widget = widget;
	
	var firstOpts = {
		hintText: $L("Master password"),
		autoFocus: true,
		autoReplace: true,
		textCase: Mojo.Widget.steModeLowerCase,
		enterSubmits: false
	};
	this.sceneAssistant.controller.setupWidget("password", firstOpts,
		this.passwordModel = {value: ''});
	var secondOpts = {
			hintText: $L("Repeat Password"),
			autoFocus: false,
			autoReplace: true,
			textCase: Mojo.Widget.steModeLowerCase,
			enterSubmits: true
	};
	this.sceneAssistant.controller.setupWidget("password2", secondOpts,
			this.password2Model = {value: ''});
    this.sceneAssistant.controller.listen("password2", Mojo.Event.propertyChange,
            this.propChangeHandler.bind(this));
	
	this.okButtonModel = {label: $L("OK"), disabled: false};
	this.sceneAssistant.controller.setupWidget("okButton", {},
			this.okButtonModel);
	this.okButton = this.sceneAssistant.controller.get("okButton");
	this.okHandler = this.ok.bindAsEventListener(this);
	this.sceneAssistant.controller.listen("okButton", Mojo.Event.tap,
			this.okHandler);
};

NewPasswordDialogAssistant.prototype.propChangeHandler = function(event) {
	if (event.originalEvent.type === 'blur') {
        this.ok();
    }
};
NewPasswordDialogAssistant.prototype.ok = function() {
	Keyring.log("got new passwords");
	this.sceneAssistant.controller.get("errmsg").update("");
	if (this.passwordModel.value === this.password2Model.value) {
		Keyring.log("matching");
		try {
			this.ring.newPassword(undefined, this.passwordModel.value);
		}
		catch(e) {
			this.sceneAssistant.controller.get("errmsg").update(e.message);
			return;
		}			
		this.widget.mojo.close();
		this.callbackOnSuccess();
	} else {
		Keyring.log("no match");
		this.sceneAssistant.controller.get("errmsg").update($L("Passwords do not match"));
	}
};

//cleanup  - remove listeners
NewPasswordDialogAssistant.prototype.cleanup = function() {
	this.sceneAssistant.controller.stopListening("okButton", Mojo.Event.tap,
			this.okHandler);
    this.sceneAssistant.controller.stopListening("password2", Mojo.Event.propertyChange,
            this.propChangeHandler.bind(this));
};
