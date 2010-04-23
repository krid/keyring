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

function ActionsAssistant(ring) {
	this.ring = ring;
}

ActionsAssistant.prototype.setup = function() {
	Keyring.log("ActionsAssistant setup");
	
	// Export
	this.controller.setupWidget("destination",
		{modelProperty: "destination",
		 label: $L("Destination"),
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
    	 choices: [{label: $L("Clipboard"), value: "clipboard"},
    	           {label: $L("URL"), value: "url"}
	               ]},
        this.ring.prefs.export_);
    this.controller.setupWidget("exportButton", {}, {
    	label: $L("Backup"),
    	disabled: false
    });
    this.exportAction = Keyring.doIfPasswordValid.bind(
    		Keyring.doIfPasswordValid, this.controller,
    		this.ring, this.export_.bind(this));

    // Import / Restore
    // Data source
	this.controller.setupWidget("source",
		{modelProperty: "source",
		 label: $L("Source"),
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
    	 choices: [{label: $L("Clipboard"), value: "clipboard"},
    	           {label: $L("File"), value: "file"},
    	           {label: $L("URL"), value: "url"}
    	           ]},
        this.ring.prefs.import_);
	// Build choices list for conflict resolution
	var choices = [];
	Object.keys(this.ring.resolutions).each(function(key) {
		choices.push({label: this[key].label, value: this[key].code});
	}, this.ring.resolutions);
	choices.sort();
	this.controller.setupWidget("resolution",
		{modelProperty: "resolution",
		 label: $L("Conflicts"),
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
		 choices: choices},
        this.ring.prefs.import_);
	// Preferences handling
	this.controller.setupWidget("prefs", {modelProperty: "prefs"},
		this.ring.prefs.import_);
    this.controller.setupWidget("importButton", {}, {
    	label: $L("Restore"),
    	disabled: false
    });
    this.importAction = Keyring.doIfPasswordValid.bind(
    		Keyring.doIfPasswordValid, this.controller,
    		this.ring, this.import_.bind(this));
    
    // Change Password
    this.controller.setupWidget("changePasswordButton", {}, {
		label: $L("Change"),
        buttonClass: 'default',
        disabled: false
    });
    this.changePassword = this.changePassword.bindAsEventListener(this);

    // Clear db
    this.controller.setupWidget("clearDatabaseButton", {}, {
    	label: $L("Clear"),
    	buttonClass: 'default',
    	disabled: false
    });
    this.clearDbAction = Keyring.doIfPasswordValid.bind(
    		Keyring.doIfPasswordValid, this.controller,
    		this.ring, this.clearDatabase.bind(this));

    this.ring.updateTimeout();
};

ActionsAssistant.prototype.export_ = function() {
	Keyring.log("Backup to", this.ring.prefs.export_.destination);
	this.ring.updateTimeout();
	if (this.ring.prefs.export_.destination === 'clipboard') {
		var encrypted = this.ring.exportableData();
		try {
			// Localization plumbing chokes on newlines in strings
			this.controller.stageController.setClipboard($L("Keyring database:") + "\n" +
				encrypted);
		}
		catch(e) {
			Mojo.Controller.errorDialog(e.name + $L(" error copying to clipboard: ") +
				e.message, this.controller.window);
			return;
		}
		this.controller.showAlertDialog({
		    onChoose: function(value) {},
		    title: $L("Database Backed Up"),
		    message: $L("An encrypted copy of the Keyring database is in the clipboard.  You may paste it into an email, memo, or web form as needed."),
		    choices:[{label:$L("OK"), value:""}]
	    });
	} else if (this.ring.prefs.export_.destination === 'url') {
		Keyring.log("dest===url");
		this.controller.showDialog({
			template: "actions/import-export-dialog",
			assistant: new ImportExportDialogAssistant(
				this.controller,
				this.exportToUrl.bind(this),
				$L("Backup to URL"),
				$L("URL"),
				this.ring.prefs.export_.url,
				false)
		});
	}
};

ActionsAssistant.prototype.exportToUrl = function(url) {
    Keyring.log("POSTing backup file to", url);
    // Strip whitespace
    url = url.replace(/^\s*(.+?)\s*$/, '$1');
	if(url.substring(0,4) !== 'http') {
		url = 'http://' + url;
	}
    this.ring.prefs.export_.url = url;
    this.ring.saveData();
	var encrypted = this.ring.exportableData();
    var tmp = new Ajax.Request(url, {
	    method: 'post',
	    parameters: new Hash({data: encrypted}),
	    evalJSON: false,
	    evalJS: false,
	    onSuccess: function(transport) {
    		if (transport.status < 200 || transport.status > 299 ||
    			! transport.responseText.match(/^\s*ok\s*$/i)) {
    			Mojo.Controller.errorDialog($L("Error backing up to #{url}").interpolate({url: url}),
					this.controller.window);
    		} else {
	    		this.ring.prefs.export_.url= url;
	    		this.controller.showAlertDialog({
	    			onChoose: function(value) {},
	    			title: $L("Database Backed Up"),
	    			message: $L("An encrypted copy of the Keyring database was POSTed to #{url}").
	    			    interpolate({url: url}), choices:[{label:$L("OK"), value:""}]
	    		});
    		}
    	}.bind(this),
	    onFailure: function(transport) {
			Mojo.Controller.errorDialog("Backup error: " +
					transport.responseText, this.controller.window);
			return;
		}.bind(this)
    });
	this.ring.updateTimeout();
};

ActionsAssistant.prototype.import_ = function() {
	Keyring.log("Restoring from", this.ring.prefs.import_.source);
	var callback, title, hint, defaultDataValue;
	if (this.ring.prefs.import_.source === 'clipboard') {
		callback = function(pastedData, password) {
			this.ring.importData(pastedData,
				this.ring.prefs.import_.resolution,
				this.ring.prefs.import_.prefs,
				password,
				this.importResults.bind(this));
		}.bind(this);
		title = $L("Restore from clipboard");
		hint = $L("Paste data here");

	} else if (this.ring.prefs.import_.source === 'file') {
		callback = this.importFileOrUrl.bind(this);
		title = $L("Restore from file");
		hint = $L("File path, relative to media partition");
		defaultDataValue = this.ring.prefs.import_.filename;
		
	} else if (this.ring.prefs.import_.source === 'url') {
		callback = this.importFileOrUrl.bind(this);
		title = $L("Restore from URL");
		hint = $L("URL of data");
		defaultDataValue = this.ring.prefs.import_.url;
	}

	this.controller.showDialog({
		template: "actions/import-export-dialog",
		assistant: new ImportExportDialogAssistant(
			this.controller, callback, title, hint, defaultDataValue, true)
	});
};

ActionsAssistant.prototype.importFileOrUrl = function(path, password) {
	var fullPath;
	// Strip leading & trailing whitespace
	path = path.replace(/^\s*(.+?)\s*$/, '$1');
	if (this.ring.prefs.import_.source === 'url') {
		// URL import
		if (path.substring(0,4) !== 'http') {
			fullPath = 'http://' + path;
		} else {
			fullPath = path;
		}
		this.ring.prefs.import_.url = fullPath;
	} else {
		if (path.charAt(0) !== '/') {
			path = '/' + path;
		}
		fullPath = '/media/internal' + path;
		this.ring.prefs.import_.filename = path;
	}
	// Save the prefs
	this.ring.saveData();
    Keyring.log("Reading import data from", fullPath);
    var tmp = new Ajax.Request(fullPath, {
	    method: 'get',
	    parameters: '',
	    evalJSON: false,
	    evalJS: false,
	    onSuccess: function(transport) {
    		if (transport.status < 200 || transport.status > 299) {
    			this.importResults(false, 'Error reading data from "' +
					path + '"');
    		} else {
				var importData = transport.responseText;
				this.ring.importData(importData,
					this.ring.prefs.import_.resolution,
					this.ring.prefs.import_.prefs,
					password,
					this.importResults.bind(this));
    		}
    	}.bind(this),
	    onFailure: function(transport) {
    		this.importResults(false, 'Unable to read data from "' +
	    		path + '": ' + transport.responseText);
    	}.bind(this)
    });
};

/* Called by ring.importData when the import is finished */ 
ActionsAssistant.prototype.importResults = function(success, arg1, arg2) {
	if (success) {
		this.controller.showAlertDialog({onChoose: function() {}.bind(this),
			title: $L("Restore finished"),
			message: $L("#{updated} items updated, #{added} items added").
			    interpolate({updated: arg1, added: arg2}),
			choices:[{label: $L('OK'), value: "ok", type: 'affirmative'}]
		});
	} else {
		Mojo.Controller.errorDialog(arg1, this.controller.window);
	}
};

ActionsAssistant.prototype.changePassword = function() {
	this.controller.showDialog({
		template: "actions/change-password-dialog",
		assistant: new ChangePasswordDialogAssistant(
			this.controller, this.ring)
	});
};

ActionsAssistant.prototype.clearDatabase = function() {
	this.controller.showAlertDialog({
		onChoose: function(value) {
		if (value.search("yes") > -1) {
			this.ring.clearDatabase(value === "yes-factory");
			this.ring.itemsReSorted = true;
			var popTo = (value === "yes-factory") ? "locked" : "item-list";
			this.controller.stageController.popScenesTo(popTo);
		}
	}.bind(this),
	title: $L("Clear Database"),
	message: $L("Are you sure you want to permanently delete all items?"),
	choices:[
	         {label: $L('Yes'), value: "yes", type: 'negative'},  
	         {label: $L('Yes & clear password + prefs'), value: "yes-factory", type: 'negative'},  
	         {label: $L("No"), value: "no", type: "affirmative"}    
	         ]
	});
};

ActionsAssistant.prototype.activate = function(event) {
	Mojo.Event.listen(this.controller.get("clearDatabaseButton"), Mojo.Event.tap,
			this.clearDbAction);
    Mojo.Event.listen(this.controller.get("changePasswordButton"), Mojo.Event.tap,
		this.changePassword);
    Mojo.Event.listen(this.controller.get("exportButton"), Mojo.Event.tap,
		this.exportAction);
    Mojo.Event.listen(this.controller.get("importButton"), Mojo.Event.tap,
		this.importAction);
    
	Keyring.activateLockout(this);
};


ActionsAssistant.prototype.deactivate = function(event) {
	Mojo.Event.stopListening(this.controller.get("clearDatabaseButton"), Mojo.Event.tap,
		this.clearDbAction);
    Mojo.Event.stopListening(this.controller.get("changePasswordButton"), Mojo.Event.tap,
		this.changePassword);
	Mojo.Event.stopListening(this.controller.get("exportButton"), Mojo.Event.tap,
		this.exportAction);
	Mojo.Event.stopListening(this.controller.get("importButton"), Mojo.Event.tap,
		this.importAction);
	
	Keyring.deactivateLockout(this);
};

ActionsAssistant.prototype.cleanup = function(event) {
};


/*
 * Dialog used for a number of different import/export actions
 */
var ImportExportDialogAssistant = Class.create ({
	initialize: function(controller, callback, title, hint, defaultDataValue,
			showPassword) {
		Keyring.log("ImportExportDialog.initialize()");
		this.controller = controller;
	    this.callbackOnSuccess = callback;
	    this.title = title;
	    this.hint = hint;
	    this.defaultDataValue = defaultDataValue;
	    this.showPassword = showPassword;
	},

	setup: function(widget) {
		Keyring.log("ImportExportDialog.setup()");
	    this.widget = widget;
	    
	    this.controller.get("dialog-title").update(this.title);
	        
	    // Multi-purpose input (pasted data, filename, url)
	    this.controller.setupWidget("data",
	        {
	             hintText: this.hint,
	             autoFocus: true,
	             limitResize: true,
	             autoReplace: false,
	             multiline: true,
	             textCase: Mojo.Widget.steModeLowerCase,
	             enterSubmits: true
	        },
	        this.dataModel = {value: this.defaultDataValue});
    
	    this.passwordModel = {value: ''};
	    if (this.showPassword) {
		    // Optional password
		    this.controller.setupWidget(
		        "password",
		        {
		          hintText: $L("Password for restored data"),
		          autoFocus: false
		        },
		        this.passwordModel);
	    } else {
			this.controller.get("password-group").hide();
			this.controller.hideWidgetContainer("password-group");
	    }
	    
	    this.controller.setupWidget("okButton", {type: Mojo.Widget.activityButton},
	        {label: $L("OK"), disabled: false});
	    this.okHandler = this.ok.bindAsEventListener(this);
	    this.controller.listen("okButton", Mojo.Event.tap, this.okHandler);
	      
	    this.controller.setupWidget("cancelButton", {type: Mojo.Widget.defaultButton},
	        {label: $L("Cancel"), disabled: false});
	    this.controller.listen("cancelButton", Mojo.Event.tap,
	    	this.widget.mojo.close);
	},
	
	keyPressHandler: function(event) {
		if (Mojo.Char.isEnterKey(event.originalEvent.keyCode)) {
		    this.ok();
		}
	},

	ok: function() {
		Keyring.log("ok");
		this.controller.stopListening("okButton", Mojo.Event.tap,
		    this.okHandler);
		this.callbackOnSuccess(this.dataModel.value, this.passwordModel.value);
	},

	//cleanup  - remove listeners
	cleanup: function() {
		this.controller.stopListening("okButton", Mojo.Event.tap,
		    this.okHandler);
		this.controller.stopListening("cancelButton", Mojo.Event.tap,
		    this.widget.mojo.close);
		if (this.inputToListen) {
			this.controller.stopListening(this.inputToListen,
				Mojo.Event.propertyChange,
				this.keyPressHandler.bind(this));
		}
	}
});


function ChangePasswordDialogAssistant(controller, ring) {
	this.controller = controller;
	this.ring = ring;
	this.model = {oldPassword: '', newPassword: '', newPassword2: ''};
}

ChangePasswordDialogAssistant.prototype.setup = function(widget) {
	this.widget = widget;
	
	this.controller.get("dialog-title").update($L("Change Password"));
	
	var oldOpts = {
		hintText: $L("Old password"),
		autoFocus: true,
		autoReplace: true,
		textCase: Mojo.Widget.steModeLowerCase,
		enterSubmits: false,
		modelProperty: "oldPassword"
	};
	this.controller.setupWidget("oldPassword", oldOpts, this.model);

	var firstOpts = {
			hintText: $L("New password"),
			autoFocus: false,
			autoReplace: true,
			textCase: Mojo.Widget.steModeLowerCase,
			enterSubmits: false,
			modelProperty: "newPassword"
	};
	this.controller.setupWidget("newPassword", firstOpts, this.model);
	var secondOpts = {
			hintText: $L("Repeat Password"),
			autoFocus: false,
			autoReplace: true,
			textCase: Mojo.Widget.steModeLowerCase,
			enterSubmits: true,
			modelProperty: "newPassword2"
	};
	this.controller.setupWidget("newPassword2", secondOpts, this.model);
    this.controller.listen("newPassword2", Mojo.Event.propertyChange,
            this.propChangeHandler.bind(this));
	
	this.okButtonModel = {label: $L("OK"), disabled: false};
	this.controller.setupWidget("okButton", {}, this.okButtonModel);
	this.okButton = this.controller.get("okButton");
	this.okHandler = this.ok.bindAsEventListener(this);
	this.controller.listen("okButton", Mojo.Event.tap,
			this.okHandler);
	this.cancelButtonModel = {label: $L("Cancel"), disabled: false};
	this.controller.setupWidget("cancelButton", {}, this.cancelButtonModel);
	this.cancelButton = this.controller.get("cancelButton");
	this.cancelHandler = this.widget.mojo.close.bindAsEventListener(this.widget.mojo);
	this.controller.listen("cancelButton", Mojo.Event.tap,
			this.cancelHandler);
	//this.controller.get("oldPassword").mojo.focus();
};

ChangePasswordDialogAssistant.prototype.propChangeHandler = function(event) {
	if (event.originalEvent.type === 'blur') {
        this.ok();
    }
};

ChangePasswordDialogAssistant.prototype.ok = function() {
	Keyring.log("got new passwords");
	if (this.model.newPassword === this.model.newPassword2) {
		Keyring.log("matching");
		try {
			this.ring.newPassword(this.model.oldPassword, this.model.newPassword);
			this.widget.mojo.close();
		} catch(e) {
			this.controller.get("errmsg").update(e.message);
			this.controller.get("oldPassword").mojo.focus();
		}
	} else {
		Keyring.log("no match");
		this.controller.get("errmsg").update($L("Passwords do not match"));
		this.controller.get("newPassword").mojo.focus();
	}
};

//cleanup  - remove listeners
ChangePasswordDialogAssistant.prototype.cleanup = function() {
	this.controller.stopListening("okButton", Mojo.Event.tap,
			this.okHandler);
	this.controller.stopListening("cancelButton", Mojo.Event.tap,
			this.cancelHandler);
    this.controller.stopListening("newPassword2", Mojo.Event.propertyChange,
            this.propChangeHandler.bind(this));
};
