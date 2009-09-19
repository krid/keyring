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

function GeneratePasswordAssistant(sceneAssistant, ring, callback) {
	this.sceneAssistant = sceneAssistant;
    this.ring = ring;
    this.callback = callback;
    this.timedOut = false;
}

GeneratePasswordAssistant.prototype.setup = function(widget) {
    this.widget = widget;
    
    this.sceneAssistant.controller.get("generate-title").update($L("Generate Password"));

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
    
    this.okButtonModel = {label: $L("Ok"), disabled: false};
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
	this.callback(this.ring.generatePassword(this.model));
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
	this.originalTitle = item ? item.title : '';
	this.createNew = false;
	this.ring = ring;
	this.fields = ["title", "username", "pass", "url", "notes"];
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
		this.item = {title:'', username:'', pass:'', url:'', notes:''};
		// Hide the dates display
		this.controller.get("dates-row").hide();
		this.controller.get("url-row").addClassName('last');
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
	for ( var i = 0; i < this.fields.length; i++) {
		var fieldAttrs = Object.clone(baseTextFieldAttrs);
		fieldAttrs.hintText = this.fields[i];
		fieldAttrs.textFieldName = this.fields[i];
		fieldAttrs.modelProperty = this.fields[i];
		if (this.fields[i] == "notes") {
			fieldAttrs.multiline = true;
			fieldAttrs.focusMode = Mojo.Widget.focusInsertMode;
		}
		this.controller.setupWidget(this.fields[i]+'Field', fieldAttrs, this.item);
	}
	
	var menuItems = [{label:"done", command:'done'},
       		       	 {label:"generate", command:'generate'}];
	if (this.createNew) {
		// Creation of new items requires explicit save
		menuItems[0].label = "save";
		// Add a cancel button, in case the user doesn't want to create an item
		menuItems.splice(1, 0, {label:"cancel", command:"cancel"});
	}
	this.controller.setupWidget(Mojo.Menu.commandMenu, undefined, 
       		{items:	menuItems});
	
	if (! this.createNew) {
		// Register that the item has been viewed.
		this.ring.noteItemView(this.item.title);
		// Prevent focus
		this.controller.setInitialFocusedElement(null);
	}
	this.ring.updateTimeout();
};

/*
 * Called when a field is changed (unfocused).  Note that the back gesture
 * generates an un-focus event before the scene is popped, so we're covered.
 * 
 * Not used for the new item case, which requires an explicit save.
 * 
 * We also don't want to trigger this on the blur that's caused as a result
 * of a timeout-initiated scene pop.
 */
ItemAssistant.prototype.fieldUpdated = function(event) {
	this.ring.updateTimeout();
	if (event.value != event.oldValue && ! this.timedOut) {
		Mojo.Log.info("field '%s' changed", event.property);
		this.ring.itemsReSorted = true;
		this.ring.updateItem(this.originalTitle, this.item);
	}
};

ItemAssistant.prototype.done = function() {
	Mojo.Log.info("done/save");
	this.ring.updateTimeout();
	if (! this.item.title) {
		Mojo.Controller.errorDialog("Title is required", this.controller.window);
		return;
	}
	if (this.createNew) {
		Mojo.Log.info("Saving new item");
		this.ring.itemsReSorted = true;
		this.ring.updateItem(null, this.item);
	}
	this.controller.stageController.popScene();
};

/* Callback for handling generated passwords. */
ItemAssistant.prototype.setGeneratedPassword = function(password) {
	Mojo.Log.info("setGenerated", password);
	this.item.pass = password;
	if (! this.createNew) {
		this.ring.updateItem(this.originalTitle, this.item);
	}
	this.controller.modelChanged(this.item);
};

/* Don't leave a password visible when we minimize. */
ItemAssistant.prototype.timeoutOrDeactivate = function() {
	Mojo.Log.info("Item scene timeoutOrDeactivate");
	if (! this.createNew) {
		// Need to update values for any fields that have unsubmitted changes
		var dirty = false;
		this.fields.each(function(field) {
			var value = this.controller.get(field+'Field').mojo.getValue();
			if (this.item[field] != value) {
				if (field == 'title' && ! value) {
					// We won't wipe out the title
					return;
				}
				this.item[field] = value;
				dirty = true;
			}
		}, this);
		if (dirty) {
			Mojo.Log.info("Found dirty field after timeout, saving");
			this.ring.updateItem(this.originalTitle, this.item);
		}
	}
	this.timedOut = true;
	this.ring.clearPassword();
	this.controller.stageController.popScene();
};

ItemAssistant.prototype.handleCommand = function(event) {
	if(event.type == Mojo.Event.command) {
		switch(event.command)
		{
			case 'done':
				this.done();
			break;
			case 'cancel':
				Mojo.Log.info("Cancelling new item creation.");
				this.controller.stageController.popScene();
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
	if (! this.createNew) {
		/* We only monitor changes on existing items.  New ones must be
		 * explicitly saved. */
		this.fields.each(function(field) {
			Mojo.Event.listen(this.controller.get(field+'Field'),
					Mojo.Event.propertyChange, this.fieldUpdated.bind(this));
		}, this);
	}
	Mojo.Event.listen(this.controller.stageController.document,
			Mojo.Event.stageDeactivate, this.timeoutOrDeactivate.bind(this));
	
	// Pop the scene if the user is idle too long
	this.cancelIdleTimeout = this.controller.setUserIdleTimeout(this.controller.sceneElement,
			this.timeoutOrDeactivate.bind(this), this.ring.prefs.timeout);
	
	this.ring.updateTimeout();
};

ItemAssistant.prototype.deactivate = function(event) {
	if (! this.createNew) {
		// FIXME not sure if this.fieldUpdated.bind(this) is the right thing here
		this.fields.each(function(field) {
			Mojo.Event.stopListening(this.controller.get(field+'Field'),
					Mojo.Event.propertyChange, this.fieldUpdated.bind(this));
		}, this);
	}
	Mojo.Event.stopListening(this.controller.stageController.document,
			Mojo.Event.stageDeactivate, this.timeoutOrDeactivate.bind(this));
	this.cancelIdleTimeout();
};

ItemAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
