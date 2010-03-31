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

function GeneratePasswordAssistant(sceneAssistant, ring, callback) {
	this.sceneAssistant = sceneAssistant;
    this.ring = ring;
    this.callback = callback;
    this.timedOut = false;
}

GeneratePasswordAssistant.prototype.setup = function(widget) {
    this.widget = widget;
    
    this.sceneAssistant.controller.get("dialog-title").
    	update($L({value: "Generate Password",
    		key: "title for 'Generate Password' dialog"}));
    this.sceneAssistant.controller.get("chars-label").
    	update($L({value: "Characters",
    		key: "label for number of 'Characters' in gen. passw. dialog"}));
    this.sceneAssistant.controller.get("types-label").
    	update($L({value: "Types",
    		key: "label for 'Types' of characters in gen. passw. dialog"}));

    this.model = Object.clone(this.ring.prefs.generatorPrefs);
    Object.keys(this.model).each(function(attr) {
    	if (attr == "characters") { return; }
    	Mojo.Log.info("attr", attr);
        this.sceneAssistant.controller.setupWidget(attr+"Field",
            {modelProperty: attr}, this.model);
    }, this);
    this.sceneAssistant.controller.setupWidget("characters",
    	{modelProperty: "characters",
    	 choices: [{label: 6, value: 6}, {label: 8, value: 8}, 
    	           {label: 10, value: 10}, {label: 12, value: 12},
    	           {label: 16, value: 16}]},
         this.model);
    
    this.okButtonModel = {label: $L("OK"), disabled: false};
    this.sceneAssistant.controller.setupWidget("okButton",
		{type: Mojo.Widget.defaultButton}, this.okButtonModel);
    this.okHandler = this.ok.bindAsEventListener(this);
    this.sceneAssistant.controller.listen("okButton", Mojo.Event.tap,
      this.okHandler);

    this.cancelButtonModel = {label: $L("Cancel"), disabled: false};
    this.sceneAssistant.controller.setupWidget("cancelButton",
      {type: Mojo.Widget.defaultButton}, this.cancelButtonModel);
    this.sceneAssistant.controller.listen("cancelButton", Mojo.Event.tap,
      this.widget.mojo.close);
    
    this.ring.updateTimeout();
};

GeneratePasswordAssistant.prototype.ok = function() {
	Mojo.Log.info("generate password");
	this.ring.prefs.generatorPrefs = this.model;
	this.callback(this.ring.randomCharacters(this.model));
	this.widget.mojo.close();
};

//cleanup  - remove listeners
GeneratePasswordAssistant.prototype.cleanup = function() {
    this.sceneAssistant.controller.stopListening("okButton", Mojo.Event.tap,
        this.okHandler);
    this.sceneAssistant.controller.stopListening("cancelButton", Mojo.Event.tap,
		this.widget.mojo.close);
};


/*
 * The scene assistant itself.
 */
function ItemAssistant(item, ring) {
	this.item = item;
	this.titleInDatabase = item ? item.title : '';
	this.createNew = false;
	this.ring = ring;
    this.menuModel= {items: []};
	this.fields = this.ring.PLAINTEXT_ATTRS.concat(this.ring.ENCRYPTED_ATTRS);
	this.hideableFields = ["username", "pass", "url", "category"];
	this.fieldError = false;
}

ItemAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */
	if (this.item) {
		var dateAttrs = ['created', 'changed', 'viewed'];
		for ( var j = 0; j < 3; j++) {
			var attr = dateAttrs[j];
			this.controller.get(attr).update(this.ring.formatDate(this.item[attr]));
		}
	} else {
		// Creating a new item
		this.createNew = true;
		this.item = this.ring.emptyItem();
		// Hide the dates display
		this.controller.get("dates-row").hide();
		this.controller.get("category-row").addClassName('last');
		this.controller.hideWidgetContainer("dates-row");
	}

	this.controller.setupWidget(Mojo.Menu.appMenu, Keyring.MenuAttr, Keyring.MenuModel);
	
	var baseTextFieldAttrs = {
			autoFocus: false,
			holdToEnable: true, 
			focusMode: Mojo.Widget.focusSelectMode,
			changeOnKeyPress: false, // send propertyChange event only when focus lost
			textCase: Mojo.Widget.steModeLowerCase,
			autoReplace: false, // SmartTextEngine
			requiresEnterKey: false
		};
	this.fields.each(function(field) {
		if (field == "category") { return; }
		var fieldAttrs = Object.clone(baseTextFieldAttrs);
		fieldAttrs.hintText = field;
		fieldAttrs.inputName = field;
		fieldAttrs.modelProperty = field;
		if (field == "notes") {
			fieldAttrs.multiline = true;
			fieldAttrs.focusMode = Mojo.Widget.focusInsertMode;
		}
		this.controller.setupWidget(field+'Field', fieldAttrs, this.item);
	}, this);
	
	this.controller.setupWidget("categoryField",
		{modelProperty: "category",
		 label: $L("Category"),
		 labelPlacement: Mojo.Widget.labelPlacementRight,
		 /* FIXME If categories are edited/added directly from the item page,
		  * they may not show up when swiping back.  If so, the choices
		  * will somehow have to be moved to the model.  See the docs for
		  * ListSelector. */
    	 choices: this.ring.categoriesForMojo(-1)},
        this.item);
	
	var somethingHidden = false;
	if (! this.createNew && this.ring.prefs.hideEmpty) {
		this.hideableFields.each(function(field) {
			if (! this.item[field]) {
				Mojo.Log.info("hiding" + field);
				this.controller.get(field+"-row").hide();
				this.controller.hideWidgetContainer(field+"-row");
				somethingHidden = true;
			}
		}, this);
	}
	
	if (this.createNew) {
		// Label button "save" instead of "done"
		this.menuModel.items.push({label: $L("save"), command: 'done'});
		// Add a cancel button, in case the user doesn't want to create an item
		this.menuModel.items.push({label: $L("cancel"), command:"cancel"});
	} else {
		this.menuModel.items.push({label: $L("done"), command: 'done'});
	}
	if (somethingHidden) {
		var labelSE = this.item.pass ?
				$L({value: "show empty", key: "short version of 'show empty' fields button"}) :
				$L({value: "show empty fields", key: "long version of 'show empty fields' button"});
		this.menuModel.items.push({label: labelSE, command:'showHidden'});
	}
	if (this.createNew || this.item.pass || (! this.ring.prefs.hideEmpty)) {
		var labelGP = somethingHidden ?
			$L({value: "gen. passwd", key: "short version of 'gen. passwd' (generate password) button"}) :
			$L({value: "generate password", key: "long version of 'generate password' button"});
		this.menuModel.items.push({label: labelGP, command: 'generate'});
	}
	this.controller.setupWidget(Mojo.Menu.commandMenu, undefined, this.menuModel);
	
	if (! this.createNew) {
		// Register that the item has been viewed.
		this.ring.noteItemView(this.item.title);
	}
	// Prevent focus
	this.controller.setInitialFocusedElement(null);
	this.ring.updateTimeout();
};

/*
 * Called when a field is changed (unfocused).  Note that the back gesture
 * generates an un-focus event before the scene is popped, so we're covered.
 * 
 * FIXME This is called if the user taps in an already active field
 * during an edit.  This generates a "false" blur event.  I can't figure
 * out how to detect this, since there's no property that says whether the
 * field is/was focused.  We can't use "Mojo.View.getFocusedElement(containingElement)",
 * because at the time this is called, the updated field is still focused.
 * 
 * We also don't want to trigger this on the blur that's caused as a result
 * of a timeout-initiated scene pop, since that's handled in timeoutOrDeactivate.
 */
ItemAssistant.prototype.fieldUpdated = function(event) {
	if (event.value != event.oldValue && ! this.timedOut) {
		this.ring.updateTimeout();
		Mojo.Log.info("field '%s' changed", event.property);
		this.ring.itemsReSorted = true;
		try {
			this.ring.updateItem(this.titleInDatabase, this.item);
		}
		catch (err) {
			Mojo.Controller.errorDialog(err.message);
			this.fieldError = err.message;
			return false;
		}
		this.fieldError = false;
		if (event.property == 'title' || ! this.titleInDatabase) {
			// title has been changed, update titleInDatabase
			this.titleInDatabase = this.item.title;
		}
	}
};

ItemAssistant.prototype.done = function() {
	Mojo.Log.info("done/save");
	this.ring.updateTimeout();
	if (this.fieldError) {
		// Don't leave if there is something wrong (probably duplicate or empty title).
		Mojo.Log.info("Error, not leaving");
		/* TODO If the field error occurs because the
		 * user hit the "done/save" button, the errorDialog will already be
		 * displayed when we get here.  It looks as if the Right Thing happens
		 * (no duplicate errorDialog), but it may break later. */
		Mojo.Controller.errorDialog(this.fieldError);
	} else {
		this.controller.stageController.popScene();
	}
};

ItemAssistant.prototype.cancel = function() {
	Mojo.Log.info("Cancelling new item creation.");
	this.ring.updateTimeout();
	if (this.titleInDatabase && this.ring.db[this.titleInDatabase]) {
		/* The current item has been saved to the db, so we need to delete
		 * it before we leave. */
		Mojo.Log.info("Deleting cancelled item");
		/* this.item.title may have been changed and not saved (duplicate?).
		 * Switch it to the saved value so the correct record is deleted. */
		this.item.title = this.titleInDatabase;
		this.ring.deleteItem(this.item);
	}
	this.controller.stageController.popScene();
};

/* Callback for handling generated passwords. */
ItemAssistant.prototype.setGeneratedPassword = function(password) {
	Mojo.Log.info("setGenerated", password);
	this.item.pass = password;
	this.controller.modelChanged(this.item);
	this.ring.updateItem(this.titleInDatabase, this.item);
};

/* Callback to set title for new item creation. */
ItemAssistant.prototype.setTitle = function(newTitle) {
	Mojo.Log.info("setTitle='%s'", newTitle);
	this.item.title = newTitle;
	this.controller.modelChanged(this.item);
	this.controller.get('usernameField').mojo.focus.delay(0.5);
};

/* Don't leave a password visible when we minimize. */
ItemAssistant.prototype.timeoutOrDeactivate = function(event) {
	Mojo.Log.info("Item scene timeoutOrDeactivate");
	/* If a field's value has been changed, but it it still focused (and thus
	 * hasn't generated a change event), we need to save the value. */
	var dirty = false;
	this.fields.each(function(field) {
		/* Skip 'category', since 1) it's a list selector, and thus doesn't
		 * have a simple mojo.getValue() accessor & 2) list selectors
		 * can't have unsubmitted changes anyways. */
		if (field === 'category') return;
		var value = this.controller.get(field+'Field').mojo.getValue();
		if (this.item[field] != value) {
			if (field == 'title') {
				if (! value) {
					// We won't wipe out the title; stick with the old one.
					return;
				} else if (value != this.titleInDatabase && this.ring.db[value]) {
					/* Title has been changed, and now collides with another
					 * item.  Stick with titleInDatabase. */
					return;
				}
			}
			this.item[field] = value;
			dirty = true;
		}
	}, this);
	if (dirty) {
		Mojo.Log.info("Found dirty field after timeout, saving");
		this.ring.updateItem(this.titleInDatabase, this.item);
	}
	this.timedOut = true;
	if (! (event && event.type == "mojo-stage-deactivate")) {
		// app-assistant does this on deactivate
		Keyring.lockout(this.controller.stageController, this.ring);
	}
};

ItemAssistant.prototype.handleCommand = function(event) {
	if(event.type == Mojo.Event.command) {
		switch(event.command)
		{
			case 'done':
				this.done();
				break;
			case 'cancel':
				this.cancel();
				break;
			case 'showHidden':
				this.hideableFields.each(function(field) {
					this.controller.get(field+"-row").show();
					this.controller.showWidgetContainer(field+"-row");
				}, this);
				// Change the "show" buttton to "generate"
				this.menuModel.items = [
                    {label: $L('done'), command: 'done'},
                    {label: $L('generate password'), command: 'generate'}
                ];
				this.controller.modelChanged(this.menuModel);
				break;
			case 'generate':
			    this.controller.showDialog({
			        template: "item/generate-password-dialog",
			        assistant: new GeneratePasswordAssistant(this, this.ring,
			        	this.setGeneratedPassword.bind(this)),
			        preventCancel: false
			    });				
			break;
			default:
				//Mojo.Controller.errorDialog("Got command " + event.command);
			break;
		}
	}
};

ItemAssistant.prototype.activate = function(event) {
	this.timedOut = false;
	this.fields.each(function(field) {
		Mojo.Event.listen(this.controller.get(field+'Field'),
				Mojo.Event.propertyChange, this.fieldUpdated.bind(this));
	}, this);
	Mojo.Event.listen(this.controller.stageController.document,
			Mojo.Event.stageDeactivate, this.timeoutOrDeactivate.bind(this));
	
	// Pop the scene if the user is idle too long
	this.cancelIdleTimeout = this.controller.setUserIdleTimeout(this.controller.sceneElement,
			this.timeoutOrDeactivate.bind(this), this.ring.prefs.timeout);
	
	this.ring.updateTimeout();
	if (this.createNew) {
		this.controller.showDialog({
			template: "textfield-dialog",
			assistant: new TitleDialogAssistant(this.controller, this.ring,
				this.setTitle.bind(this)),
	        preventCancel: false
		});
	}
};

ItemAssistant.prototype.deactivate = function(event) {
	// FIXME not sure if this.fieldUpdated.bind(this) is the right thing here
	this.fields.each(function(field) {
		Mojo.Event.stopListening(this.controller.get(field+'Field'),
				Mojo.Event.propertyChange, this.fieldUpdated.bind(this));
	}, this);
	Mojo.Event.stopListening(this.controller.stageController.document,
			Mojo.Event.stageDeactivate, this.timeoutOrDeactivate.bind(this));
	this.cancelIdleTimeout();
};


/*
 * Dialog to take the title for a newly created item.
 */
TitleDialogAssistant = Class.create ({
	initialize: function(controller, ring, callback) {
		this.controller = controller;
	    this.ring = ring;
	    this.callbackOnSuccess = callback;
	    this.titleEntered = false;
	},

	setup: function(widget) {
	    this.widget = widget;
	    
	    this.controller.get("dialog-title").update($L("Title for item"));
	        
	    this.controller.setupWidget(
	        "text",
	        {
	              hintText: $L("Title"),
	              autoFocus: true,
	              changeOnKeyPress: true,
	              limitResize: true,
	              autoReplace: false,
	              enterSubmits: true,
	              requiresEnterKey: true
	        },
	        this.model = {value: ''});
	
	    this.controller.listen("text", Mojo.Event.propertyChange,
	        this.keyPressHandler.bind(this));
	    
	    this.saveButtonModel = {label: $L("OK"), disabled: false};
	    this.controller.setupWidget("saveButton", {type: Mojo.Widget.defaultButton},
	        this.saveButtonModel);
	    this.saveHandler = this.save.bindAsEventListener(this);
	    this.controller.listen("saveButton", Mojo.Event.tap,
	        this.saveHandler);
	    
	    this.cancelButtonModel = {label: $L("Cancel"), disabled: false};
	    this.controller.setupWidget("cancelButton", {type: Mojo.Widget.defaultButton},
	        this.cancelButtonModel);
	    this.controller.listen("cancelButton", Mojo.Event.tap,
	    	this.cancel.bind(this));
	},
	
	keyPressHandler: function(event) {
		if (Mojo.Char.isEnterKey(event.originalEvent.keyCode)) {
		    this.save();
		}
	},
	
	save: function() {
		Mojo.Log.info("save");
		var newTitle = this.model.value.replace(/^\s*(.*?)\s*$/, '$1');
		Mojo.Log.info("newTitle='%s'", newTitle);
		if (! newTitle) {
			Mojo.Log.info("No title");
			var errmsg = $L("Title is required.");
			this.controller.get("errmsg").update(errmsg);
			this.controller.get("text").mojo.focus.delay(0.25);
		} else if (this.ring.db[newTitle]) {
			Mojo.Log.info("Dup title");
			var errmsg = $L("Item \"#{newTitle}\" already exists.").
			    interpolate({newTitle: newTitle});
			this.controller.get("errmsg").update(errmsg);
			this.controller.get("text").mojo.focus.delay(0.25);
		} else {
			this.titleEntered = true;
			this.widget.mojo.close();
			this.callbackOnSuccess(newTitle);
		}
	},
	
	cancel: function() {
		this.controller.stageController.popScene();
	},
	
	//cleanup  - remove listeners
	cleanup: function() {
		this.controller.stopListening("saveButton", Mojo.Event.tap,
		    this.saveHandler);
		this.controller.stopListening("cancelButton", Mojo.Event.tap,
			this.widget.mojo.close);
		this.controller.stopListening("text", Mojo.Event.propertyChange,
	        this.keyPressHandler.bind(this));
		if (! this.titleEntered) {
			this.cancel();
		}
	}
});
