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

function ActionsAssistant(ring) {
	this.ring = ring;
}

ActionsAssistant.prototype.setup = function() {
	Mojo.Log.info("setup");
	
	// Export
	this.controller.setupWidget("destination",
		{modelProperty: "destination",
    	 choices: [{label: $L("Clipboard"), value: "clipboard"},
    	           {label: $L("URL"), value: "url"}
	               ]},
        this.ring.prefs.export_);
    this.controller.setupWidget("exportButton", {}, {
    	label: $L("Export"),
    	disabled: false
    });
    this.exportAction = Keyring.doIfPasswordValid.bind(
    		Keyring.doIfPasswordValid, this.controller,
    		this.ring, this.export_.bind(this));

    // Import / Restore
    // Data source
	this.controller.setupWidget("source",
		{modelProperty: "source",
    	 choices: [{label: $L("Clipboard"), value: "clipboard"},
    	           {label: $L("File"), value: "file"},
    	           {label: $L("URL"), value: "url"}
    	           ]},
        this.ring.prefs.import_);
	// Build choices list for conflict resolution
	var choices = [];
	Object.keys(this.ring.resolutions).each(function(key) {
		choices.push({label: this[key], value: key});
	}, this.ring.resolutions);
	choices.sort();
	this.controller.setupWidget("resolution",
			{modelProperty: "resolution", choices: choices},
            this.ring.prefs.import_);
	// Preferences handling
	this.controller.setupWidget("prefs", {modelProperty: "prefs"},
		this.ring.prefs.import_);
    this.controller.setupWidget("importButton", {}, {
    	label: $L("Import"),
    	disabled: false
    });
    this.importAction = Keyring.doIfPasswordValid.bind(
    		Keyring.doIfPasswordValid, this.controller,
    		this.ring, this.import_.bind(this));
    
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
	Mojo.Log.info("Exporting to", this.ring.prefs.export_.destination);
	this.ring.updateTimeout();
	if (this.ring.prefs.export_.destination === 'clipboard') {
		var encrypted = this.ring.exportableData();
		Mojo.Log.info("\n\n", encrypted, "\n\n");
		try {
			this.controller.stageController.setClipboard("Keyring database:\n" +
				encrypted);
		}
		catch(e) {
			Mojo.Controller.errorDialog(e.name + " error copying to clipboard: " +
				e.message, this.controller.window);
			return;
		}
		this.controller.showAlertDialog({
		    onChoose: function(value) {},
		    title: $L("Database Exported"),
		    message: $L("An encrypted copy of the Keyring database is in the clipboard.  You may paste it into an email, memo, or web form as needed."),
		    choices:[{label:$L("OK"), value:""}]
	    });
	} else if (this.ring.prefs.export_.destination === 'url') {
		Mojo.Log.info("dest===url");
		this.controller.showDialog({
			template: "actions/import-export-dialog",
			assistant: new ImportExportDialogAssistant(
				this.controller,
				this.exportToUrl.bind(this),
				$L("Export to URL"),
				$L("URL"),
				this.ring.prefs.export_.url,
				false)
		});
	}
};

ActionsAssistant.prototype.exportToUrl = function(url) {
    Mojo.Log.info("POSTing export file to", url);
    this.ring.prefs.export_.url = url;
    this.ring.saveData();
	var encrypted = this.ring.exportableData();
	Mojo.Log.info("\n\n", encrypted, "\n\n");
    var tmp = new Ajax.Request(url, {
	    method: 'post',
	    parameters: new Hash({data: encrypted}),
	    evalJSON: false,
	    evalJS: false,
	    onSuccess: function(transport) {
    		this.ring.prefs.export_.url= url;
    		this.controller.showAlertDialog({
    			onChoose: function(value) {},
    			title: $L("Database Exported"),
    			message: $L("An encrypted copy of the Keyring database was POSTed to " +
					url + "."),
    			choices:[{label:$L("OK"), value:""}]
    		});
    	}.bind(this),
	    onFailure: function(transport) {
			Mojo.Controller.errorDialog(e.name + " error exporting: " +
					transport.responseText, this.controller.window);
			return;
		}.bind(this)
    });
	this.ring.updateTimeout();
};

ActionsAssistant.prototype.import_ = function() {
	Mojo.Log.info("Importing from", this.ring.prefs.import_.source);
	var callback, title, hint, defaultDataValue;
	if (this.ring.prefs.import_.source === 'clipboard') {
		callback = function(pastedData, password) {
			this.ring.importData(pastedData,
				this.ring.prefs.import_.resolution,
				this.ring.prefs.import_.prefs,
				password,
				this.importResults.bind(this));
		}.bind(this);
		title = $L("Import from clipboard");
		hint = $L("Paste import data here");

	} else if (this.ring.prefs.import_.source === 'file') {
		callback = this.importFileOrUrl.bind(this);
		title = $L("Import from file");
		hint = $L("File path, relative to media partition");
		defaultDataValue = this.ring.prefs.import_.filename;
		
	} else if (this.ring.prefs.import_.source === 'url') {
		callback = this.importFileOrUrl.bind(this);
		title = $L("Import from URL");
		hint = $L("URL of import data");
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
		if( path.substring(0,4) != 'http') {
			fullPath = 'http://' + path;
		} else {
			fullPath = path;
		}
		this.ring.prefs.import_.url = fullPath;
	} else if (! path.charAt(0) != '/') {
		path = '/' + path;
		fullPath = '/media/internal' + filename;
		this.ring.prefs.import_.filename = path;
	}
    Mojo.Log.info("Reading import data from", fullPath);
    var tmp = new Ajax.Request(fullPath, {
	    method: 'get',
	    parameters: '',
	    evalJSON: false,
	    evalJS: false,
	    onSuccess: function(transport, password) {
			var importData = transport.responseText;
			this.ring.importData(importData,
				this.ring.prefs.import_.resolution,
				this.ring.prefs.import_.prefs,
				password,
				this.importResults.bind(this));
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
			title: $L("Import finished"),
			message: arg1 + $L(" items updated, ") + arg2 + $L(" items added"),
			choices:[{label: $L('Ok'), value: "ok", type: 'affirmative'}]
		});
	} else {
		Mojo.Controller.errorDialog(arg1, this.controller.window);
	}
};

ActionsAssistant.prototype.clearDatabase = function() {
	this.controller.showAlertDialog({
		onChoose: function(value) {
		if (value.search("yes") > -1) {
			this.ring.clearDatabase(value == "yes-factory");
			this.ring.itemsReSorted = true;
			this.controller.stageController.popScene();
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

/* Don't leave an item visible when we minimize. */
ActionsAssistant.prototype.timeoutOrDeactivate = function() {
	Mojo.Log.info("Actions scene timeoutOrDeactivate");
	this.ring.clearPassword();
	this.controller.stageController.popScene();
};

ActionsAssistant.prototype.activate = function(event) {
    Mojo.Event.listen(this.controller.get("clearDatabaseButton"), Mojo.Event.tap,
		this.clearDbAction);
    Mojo.Event.listen(this.controller.get("exportButton"), Mojo.Event.tap,
		this.exportAction);
    Mojo.Event.listen(this.controller.get("importButton"), Mojo.Event.tap,
		this.importAction);
    
	Mojo.Event.listen(this.controller.stageController.document,
		Mojo.Event.stageDeactivate, this.timeoutOrDeactivate.bind(this));
	
	// Pop the scene if the user is idle too long
	this.cancelIdleTimeout = this.controller.setUserIdleTimeout(this.controller.sceneElement,
		this.timeoutOrDeactivate.bind(this), this.ring.prefs.timeout); 
};


ActionsAssistant.prototype.deactivate = function(event) {
	Mojo.Event.stopListening(this.controller.get("clearDatabaseButton"), Mojo.Event.tap,
		this.clearDbAction);
	Mojo.Event.stopListening(this.controller.get("exportButton"), Mojo.Event.tap,
		this.exportAction);
	Mojo.Event.stopListening(this.controller.get("importButton"), Mojo.Event.tap,
		this.importAction);
	
	Mojo.Event.stopListening(this.controller.stageController.document,
		Mojo.Event.stageDeactivate, this.timeoutOrDeactivate.bind(this));
	this.cancelIdleTimeout();
};

ActionsAssistant.prototype.cleanup = function(event) {
};


/*
 * Dialog used for a number of different import/export actions
 */
ImportExportDialogAssistant = Class.create ({
	initialize: function(controller, callback, title, hint, defaultDataValue,
			showPassword) {
		Mojo.Log.info("ImportExportDialog.initialize()");
		this.controller = controller;
	    this.callbackOnSuccess = callback;
	    this.title = title;
	    this.hint = hint;
	    this.defaultDataValue = defaultDataValue;
	    this.showPassword = showPassword;
	},

	setup: function(widget) {
		Mojo.Log.info("ImportExportDialog.setup()");
	    this.widget = widget;
	    
	    this.controller.get("dialog-title").update(this.title);
	        
	    // Multi-purpose input (pasted data, filename, url)
	    this.controller.setupWidget("data",
	        {
	             hintText: this.hint,
	             autoFocus: true,
	             limitResize: true,
	             autoReplace: false,
	             textCase: Mojo.Widget.steModeLowerCase,
	             enterSubmits: false
	        },
	        this.dataModel = {value: this.defaultDataValue});
    
	    this.passwordModel = {value: ''};
	    if (this.showPassword) {
		    // Optional password
		    this.controller.setupWidget(
		        "password",
		        {
		          hintText: $L("Password (if different from current)"),
		          autoFocus: false
		        },
		        this.passwordModel
		        );
	    } else {
			this.controller.get("password-group").hide();
			this.controller.hideWidgetContainer("password-group");
	    }
	    
	    this.controller.setupWidget("okButton", {type: Mojo.Widget.defaultButton},
	        {label: $L("Ok"), disabled: false});
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
		Mojo.Log.info("ok");
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
