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

/**
 * The "Enter your password" dialog, used throughout the application.
 */
var PasswordDialogAssistant = Class.create ({
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
		Keyring.log("unlock");
		if (this.ring.validatePassword(this.passwordModel.value)) {
			Keyring.log("Password accepted");
			this.widget.mojo.close();
			this.callbackOnSuccess();
		} else {
			Keyring.log("Bad Password");
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
