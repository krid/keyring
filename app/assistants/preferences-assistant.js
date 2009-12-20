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

function PreferencesAssistant(ring) {
	this.ring = ring;
	this.fieldsToListen = [];
}

PreferencesAssistant.prototype.setup = function() {
	Mojo.Log.info("setup prefs scene");
	
	this.controller.setupWidget("requireInitialPassword",
		{modelProperty: "requireInitialPassword",
		 falseLabel: "no",
		 trueLabel: "yes"},
		this.ring.prefs);
	this.fieldsToListen.push("requireInitialPassword");
	
	this.controller.setupWidget("timeout",
		{modelProperty: "timeout",
		 label: "Timeout",
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
    	 choices: [{label: "5 seconds", value: 5000},
    	           {label: "15 seconds", value: 15000},
	               {label: "30 seconds", value: 30000}, 
	               {label: "1 minute", value: 60000},
	               {label: "2 minutes", value: 120000},
	               {label: "5 minutes", value: 300000}]},
        this.ring.prefs);
	this.fieldsToListen.push("timeout");

	this.controller.setupWidget("lockoutTo",
		{modelProperty: "lockoutTo",
		 label: "Lockout to",
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
    	 choices: [{label: "Lock scene", value: "locked"},
    	           {label: "Item list", value: "item-list"}]},
        this.ring.prefs);
	this.fieldsToListen.push("lockoutTo");

	var choices = [];
	Object.keys(this.ring.onDeactivateOptions).each(function(key) {
		choices.push({label: this[key].label, value: this[key].code});
	}, this.ring.onDeactivateOptions);
	choices.sort();
	this.controller.setupWidget("onDeactivate",
		{modelProperty: "onDeactivate",
		 label: "On Deactivate",
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
		 choices: choices},
        this.ring.prefs);
	this.fieldsToListen.push("onDeactivate");

	this.controller.setupWidget("sortBy",
		{modelProperty: "sortBy",
		 label: "Sort By",
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
		 choices: [{label: "Title", value: "TITLE"},
		          {label: "Last Viewed", value: "viewed"},
		          {label: "Last Changed", value: "changed"},
		          {label: "Created Date", value: "created"}]},
        this.ring.prefs);
	this.fieldsToListen.push("sortBy");
	
	this.controller.setupWidget("hideEmpty",
		{modelProperty: "hideEmpty",
		 falseLabel: "no",
		 trueLabel: "yes"},
		this.ring.prefs);

	// Character types for password generator
    Object.keys(this.ring.prefs.generatorPrefs).each(function(attr) {
    	if (attr == "characters") { return; }
        this.controller.setupWidget(attr+"Field",
            {modelProperty: attr}, this.ring.prefs.generatorPrefs);
        this.fieldsToListen.push(attr+"Field");
    }, this);

    // RadioButton for number of characters in password generator
    this.controller.setupWidget("characters",
    	{modelProperty: "characters",
   	     choices: [{label: 6, value: 6}, {label: 8, value: 8}, 
		          {label: 10, value: 10}, {label: 12, value: 12},
		          {label: 16, value: 16}]},
         this.ring.prefs.generatorPrefs);
    this.fieldsToListen.push("characters");
    
    this.ring.updateTimeout();
};

PreferencesAssistant.prototype.fieldUpdated = function(event) {
	if (event.value != event.oldValue) {
		Mojo.Log.info("field '%s' changed", event.property);
		this.ring.saveData();
		if (event.property == "sortBy") {
			this.ring.buildItemList();
			this.ring.itemsReSorted = true;
		}
	}
	this.ring.updateTimeout();
};

PreferencesAssistant.prototype.activate = function(event) {
	Mojo.Log.info("activate");
	this.fieldsToListen.each(function(field) {
		Mojo.Event.listen(this.controller.get(field),
				Mojo.Event.propertyChange, this.fieldUpdated.bind(this));
	}, this);
	Keyring.activateLockout(this);
};

PreferencesAssistant.prototype.deactivate = function(event) {
	// FIXME not sure if this.fieldUpdated.bind(this) is the right thing here
	this.fieldsToListen.each(function(field) {
		Mojo.Event.stopListening(this.controller.get(field),
				Mojo.Event.propertyChange, this.fieldUpdated.bind(this));
	}, this);
	
	Keyring.deactivateLockout(this);
};

PreferencesAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
};
