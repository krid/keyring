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

function PreferencesAssistant(ring) {
	this.ring = ring;
	this.fieldsToListen = [];
}

PreferencesAssistant.prototype.setup = function() {
	Keyring.log("setup prefs scene");
	
	this.controller.setupWidget("timeout",
		{modelProperty: "timeout",
		 label: $L("Timeout"),
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
    	 choices: [{label: $L("5 seconds"), value: 5000},
    	           {label: $L("15 seconds"), value: 15000},
	               {label: $L("30 seconds"), value: 30000}, 
	               {label: $L("1 minute"), value: 60000},
	               {label: $L("2 minutes"), value: 120000},
	               {label: $L("5 minutes"), value: 300000}]},
        this.ring.prefs);
	this.fieldsToListen.push("timeout");

	this.controller.setupWidget("lockoutTo",
		{modelProperty: "lockoutTo",
		 label: $L("Lockout to"),
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
    	 choices: this.ring.lockoutToOptions},
        this.ring.prefs);
	this.fieldsToListen.push("lockoutTo");

	this.controller.setupWidget("onDeactivate",
		{modelProperty: "onDeactivate",
		 label: $L("On Deactivate"),
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
		 choices: this.ring.onDeactivateOptions},
        this.ring.prefs);
	this.fieldsToListen.push("onDeactivate");

	this.controller.setupWidget("sortBy",
		{modelProperty: "sortBy",
		 label: $L("Sort By"),
		 labelPlacement: Mojo.Widget.labelPlacementLeft,
		 choices: [{label: $L("Title"), value: "TITLE"},
		          {label: $L("Last Viewed"), value: "viewed"},
		          {label: $L("Last Changed"), value: "changed"},
		          {label: $L("Created Date"), value: "created"}]},
        this.ring.prefs);
	this.fieldsToListen.push("sortBy");
	
	this.controller.setupWidget("hideEmpty",
		{modelProperty: "hideEmpty",
		 falseLabel: $L("no"),
		 trueLabel: $L("yes")},
		this.ring.prefs);

	// Character types for password generator
    Object.keys(this.ring.prefs.generatorPrefs).each(function(attr) {
    	if (attr === "characters") { return; }
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
	if (event.value !== event.oldValue) {
		Keyring.log("field '%s' changed", event.property);
		this.ring.saveData();
		if (event.property === "sortBy") {
			this.ring.buildItemList();
			this.ring.itemsReSorted = true;
		}
	}
	this.ring.updateTimeout();
};

PreferencesAssistant.prototype.activate = function(event) {
	Keyring.log("activate");
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
