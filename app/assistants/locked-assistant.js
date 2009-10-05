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
	this.beenHereBefore = false;
}

LockedAssistant.prototype.setup = function() {
	this.loadingMessage = this.controller.get("loading-mesg").update($L("Initializing..."));
	this.controller.setupWidget("loading-spinner",
         {spinnerSize: Mojo.Widget.spinnerSmall},
         this.spinnerModel = {
             spinning: true 
         });
	this.ring.initDepotReader(this.loaded.bind(this));
	//var dl=function(){}.bind(this);dl.delay(1); // to add a delay for testing
};

LockedAssistant.prototype.loaded = function() {
	// The ring is loaded, get rid of all the "Loading..." stuff
	this.spinnerModel.spinning = false;
	this.controller.modelChanged(this.spinnerModel);
	//this.controller.get("loading-scrim").removeClassName("palm-scrim");
	this.loadingMessage.update($L("Ready"));
	this.doYourThing();
};

LockedAssistant.prototype.doYourThing = function() {
	var pushToItemList = function() {
		this.beenHereBefore = true;
		this.controller.stageController.pushScene("item-list", this.ring);
		this.loadingMessage.update($L("Keyring locked"));
		this.controller.get("img-div").update('<img src="images/lock.png"/>');
	}.bind(this);
	
	if (this.ring.firstRun) {
		// User has not yet set a master password
		this.loadingMessage.update($L("Set initial password"));
	    this.controller.showDialog({
	        template: "loading/new-password-dialog",
	        preventCancel:true,
	        assistant: new NewPasswordDialogAssistant(this, this.ring,
        		pushToItemList)
	    });
	    
	} else if (this.beenHereBefore || this.ring.prefs.requireInitialPassword) {
		// We get here on timeout/deactivate as well as at launch
		Keyring.doIfPasswordValid(this.controller, this.ring, pushToItemList, true);
		
	} else {
		pushToItemList();
	}
};

LockedAssistant.prototype.activate = function(event) {
	if (this.beenHereBefore) {
		this.doYourThing();
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
	
	this.okButtonModel = {label: $L("Ok"), disabled: false};
	this.sceneAssistant.controller.setupWidget("okButton", {},
			this.okButtonModel);
	this.okButton = this.sceneAssistant.controller.get("okButton");
	this.okHandler = this.ok.bindAsEventListener(this);
	this.sceneAssistant.controller.listen("okButton", Mojo.Event.tap,
			this.okHandler);
};

NewPasswordDialogAssistant.prototype.propChangeHandler = function(event) {
	if (event.originalEvent.type == 'blur') {
        this.ok();
    }
};
NewPasswordDialogAssistant.prototype.ok = function() {
	Mojo.Log.info("got new passwords");
	if (this.passwordModel.value === this.password2Model.value) {
		Mojo.Log.info("matching");
		this.ring.newPassword(this.passwordModel.value);
		this.widget.mojo.close();
		this.callbackOnSuccess();
	} else {
		Mojo.Log.info("no match");
		this.sceneAssistant.controller.get("errmsg").update($L("Passwords do not match"));
	}
};

//cleanup  - remove listeners
NewPasswordDialogAssistant.prototype.cleanup = function() {
	this.sceneAssistant.controller.stopListening("okButton", Mojo.Event.tap,
			this.okHandler);
    this.sceneAssistant.controller.stopListening("password2", Mojo.Event.propertyChange,
            this.keyPressHandler.bind(this));
};
