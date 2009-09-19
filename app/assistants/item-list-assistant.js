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

/*
 * The dialog used to set the initial password.
 */
function NewPasswordDialogAssistant(sceneAssistant, ring) {
	this.sceneAssistant = sceneAssistant;
	this.ring = ring;
}

NewPasswordDialogAssistant.prototype.setup = function(widget) {
	this.widget = widget;
	
	this.sceneAssistant.controller.get("password-title").update($L("Create Master Password"));

	var firstOpts = {
		hintText: $L("Password"),
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
			enterSubmits: true,
			changeOnKeyPress: true
	};
	this.sceneAssistant.controller.setupWidget("password2", secondOpts,
			this.password2Model = {value: ''});
    this.sceneAssistant.controller.listen("password2", Mojo.Event.propertyChange,
            this.keyPressHandler.bind(this));
	
	this.okButtonModel = {label: $L("Ok"), disabled: false};
	this.sceneAssistant.controller.setupWidget("okButton", {},
			this.okButtonModel);
	this.okButton = this.sceneAssistant.controller.get("okButton");
	this.okHandler = this.ok.bindAsEventListener(this);
	this.sceneAssistant.controller.listen("okButton", Mojo.Event.tap,
			this.okHandler);
};

NewPasswordDialogAssistant.prototype.keyPressHandler = function(event) {
	if (Mojo.Char.isEnterKey(event.originalEvent.keyCode)) {
        this.ok();
    }
};
NewPasswordDialogAssistant.prototype.ok = function() {
	Mojo.Log.info("got new passwords");
	if (this.passwordModel.value === this.password2Model.value) {
		Mojo.Log.info("matching");
		this.ring.newPassword(this.passwordModel.value);
		this.widget.mojo.close();
	} else {
		Mojo.Log.info("no match");
		this.sceneAssistant.controller.get("errmsg").update($L("==> Passwords do not match <=="));
	}
};

//cleanup  - remove listeners
NewPasswordDialogAssistant.prototype.cleanup = function() {
	this.sceneAssistant.controller.stopListening("okButton", Mojo.Event.tap,
			this.okHandler);
    this.sceneAssistant.controller.stopListening("password2", Mojo.Event.propertyChange,
            this.keyPressHandler.bind(this));
};



function ItemListAssistant(ring) {
	/* this is the creator function for your scene assistant object. It will be passed all the
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
	this.ring = ring;
}

/*
 * This will wait until the ring object has finished the asynchronous Depot
 * reads and fully initialized itself, and *then* do the setup.
 * 
 * FIXME This is probably not the best solution.  An interstitial screen might be good.
 * However, the initialization takes < 0.2 sec on the emulator, so I don't
 * think it much matters in practice.
 */
ItemListAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */
	this.filterString = '';
	
	/* use Mojo.View.render to render view templates and add them to the scene, if needed. */
	//render the items in a list using a partial template.

	/* setup widgets here */
	Mojo.Log.info("rendering item-list");
	this.controller.setupWidget(Mojo.Menu.appMenu,
			Keyring.MenuAttr, Keyring.MenuModel);
	this.controller.setupWidget(Mojo.Menu.commandMenu, undefined, 
			{items:	[{label:"new", command:'new'},
			       	{label:"sort by...", command:'sort'}]});
	var listAttributes = {
		itemTemplate: 'item-list/item',
		swipeToDelete: true,
		reorderable: false,
		filterFunction: this.filterItems.bind(this),
		delay: 200, // milliseconds of delay before filter string is used
		disabledProperty: 'disabled'
	};
	this.controller.setupWidget('ring-items', listAttributes, this.ring);

	/* add event handlers to listen to events from widgets */
	Mojo.Log.info("binding tap and delete events");
	this.tapped = this.tapped.bindAsEventListener(this);
	this.deleted = this.deleted.bindAsEventListener(this);
};

ItemListAssistant.prototype.handleCommand = function(event) {
	if(event.type == Mojo.Event.command) {
		switch(event.command)
		{
			case 'new':
				Keyring.doIfPasswordValid(this.controller, this.ring,
					this.controller.stageController.pushScene.
					bind(this.controller.stageController, "item", '', this.ring)
				);
			break;
			case 'sort':
				this.controller.popupSubmenu({
					onChoose: this.sortPopupHandler,
					placeNear: event.target,
					items: [{label: "Title", command: "TITLE"},
					  {label: "Last Viewed", command: "viewed"},
					  {label: "Last Changed", command: "changed"},
					  {label: "Created Date", command: "created"}],
					toggleCmd: this.ring.prefs.sortBy
				});
			break;
			default:
				//Mojo.Controller.errorDialog("Got command " + event.command);
			break;
		}
	}
};

ItemListAssistant.prototype.sortPopupHandler = function(command) {
	if (! command) {
		return;
	}
	Mojo.Log.info("sortPopupHandler, command='%s'", command);
	this.ring.prefs.sortBy = command;
	this.ring.savePrefs();
	this.ring.buildItemList();
	this.controller.modelChanged(this.ring);
};

ItemListAssistant.prototype.tapped = function(event) {
	Mojo.Log.info("Tapped item '%s'", event.item.title);
	Keyring.doIfPasswordValid(this.controller, this.ring,
			this.pushItemScene.bind(this, event.item.title));
};

ItemListAssistant.prototype.pushItemScene = function(title) {
	// Get the decrypted version of the item
	var item
	try {
		item = this.ring.getItem(title);
	}
	catch(e) {
		Mojo.Controller.errorDialog(e.message, this.controller.window);
		return;
	}
	if (! item) {
		Mojo.Log.info("Error fetching item, retrieved null");
		Mojo.Controller.errorDialog("Error decrypting item.", this.controller.window);
		return;
	}
	this.controller.stageController.pushScene("item", item, this.ring);
};

ItemListAssistant.prototype.deleted = function(event) {
	Mojo.Log.info("Deleting item '%s'", event.item.title);
	Keyring.doIfPasswordValid(this.controller, this.ring,
			this.ring.deleteItem.bind(this.ring, event.item));
};

ItemListAssistant.prototype.filterItems = function(filterString, listWidget, offset, count) {
	/* Filter visible entries based on entered text. */
	Mojo.Log.info("Filtering on '" + filterString + "'.");
	var subset = [];
	var totalSubsetSize = 0;
	
	var i = 0;
	while (i < this.ring.items.length) {
        if (this.ring.items[i].title.include(filterString)) {
			if (subset.length < count && totalSubsetSize >= offset) {
				subset.push(this.ring.items[i]);
			}
			totalSubsetSize++;
		}
		i++;
	}
	Mojo.Log.info("Filtered down to %s items.", totalSubsetSize);
	
	//update the items in the list with the subset
	listWidget.mojo.noticeUpdatedItems(offset, subset);
	
	//set the list's length & count if we're not repeating the same filter string from an earlier pass
	if (this.filterString !== filterString) {
		listWidget.mojo.setLength(totalSubsetSize);
		listWidget.mojo.setCount(totalSubsetSize);
	}
	// Save the filter string for the next time
	this.filterString = filterString;
};

/*
 * FIXME I'd rather start the data load in app-assistant.setup(), but I can't
 * figure out how to get hold of the right callback there.  Doing it here
 * means we start the load about 0.1 seconds later. */
ItemListAssistant.prototype.aboutToActivate = function(callback) {
	Mojo.Log.info("aboutToActivate");
	if (! this.ring.depotDataLoaded) {
		this.ring.initDepotReader(this.preActivationCallback.bind(this, callback));
	}
};

ItemListAssistant.prototype.preActivationCallback = function(callback) {
	Mojo.Log.info("preActivationCallback");
	this.controller.modelChanged(this.ring);
	callback();
}

ItemListAssistant.prototype.activate = function(event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
	Mojo.Log.info("activate");
	if (this.ring.firstRun) {
		// User has not yet set a master password
	    this.controller.showDialog({
	        template: "item-list/new-password-dialog",
	        assistant: new NewPasswordDialogAssistant(this, this.ring),
	        preventCancel:true
	    });
	}
	if (this.ring.itemsReSorted) {
		// Need to redisplay the item list
		// FIXME When we do this, if there was a filter set, it is retained,
		// but the value in the filter input is cleared.
		this.ring.itemsReSorted = false;
		this.controller.modelChanged(this.ring);
	}
	Mojo.Event.listen(this.controller.get('ring-items'),
			Mojo.Event.listTap, this.tapped);
	Mojo.Event.listen(this.controller.get('ring-items'),
			Mojo.Event.listDelete, this.deleted);

	// Clear password after idle timeout
	this.cancelIdleTimeout = this.controller.setUserIdleTimeout(this.controller.sceneElement,
			this.ring.clearPassword.bind(this.ring), this.ring.prefs.timeout);
};


ItemListAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
	Mojo.Event.stopListening(this.controller.get('ring-items'),
			Mojo.Event.listTap, this.tapped);
	Mojo.Event.stopListening(this.controller.get('ring-items'),
			Mojo.Event.listDelete, this.deleted);
	this.cancelIdleTimeout();
};

ItemListAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as
	   a result of being popped off the scene stack */
};
