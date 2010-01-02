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

function ItemListAssistant(ring) {
	this.ring = ring;
	this.category = -1;
	this.filterString = undefined;
	this.itemList = null;
	this.sortByChoices = [
        {label: "Title", command: "TITLE"},
        {label: "Last Viewed", command: "viewed"},
        {label: "Last Changed", command: "changed"},
        {label: "Created Date", command: "created"}
    ];
}

ItemListAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */

	Mojo.Log.info("rendering item-list");
	this.controller.setupWidget(Mojo.Menu.appMenu,
			Keyring.MenuAttr, Keyring.MenuModel);
	this.controller.setupWidget(Mojo.Menu.commandMenu, undefined, 
			{items:	[{label:"new", command:'new'},
			       	 {label:'category', command:'category'},
			       	 {label:"sort by...", command:'sort'}]});
	
	var listAttributes = {
		itemTemplate: 'item-list/item',
		fixedHeightItems: true,
		swipeToDelete: true,
		reorderable: false,
		filterFunction: this.filterItems.bind(this),
		delay: 200, // milliseconds of delay before filter string is used
		disabledProperty: 'disabled'
	};
	this.controller.setupWidget('ring-items', listAttributes, this.ring);
	this.itemList = this.controller.get('ring-items');

	// Set the status messages
	this.controller.get("category").update(this.ring.categories[this.category]);
	
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
				Keyring.doIfPasswordValid(this.controller, this.ring,
					this.controller.popupSubmenu.bind(this.controller, {
						onChoose: this.sortPopupHandler,
						placeNear: event.target,
						items: this.sortByChoices,
						toggleCmd: this.ring.prefs.sortBy
					}));
				break;
			case 'category':
				var cats = this.ring.categoriesForMojo();
				cats.push({label: 'Edit Categories', command: '++edit++'});
				Keyring.doIfPasswordValid(this.controller, this.ring,
					this.controller.popupSubmenu.bind(this.controller, {
						onChoose: this.setCategory,
						placeNear: event.target,
						items: cats,
				        toggleCmd: this.ring.prefs.category
					}));
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
	this.ring.saveData();
	this.ring.buildItemList();
	this.controller.modelChanged(this.ring);
	this.setSortingStatus();
};

ItemListAssistant.prototype.setSortingStatus = function() {
	this.sortByChoices.each(function(sb){
		if (this.ring.prefs.sortBy == sb.command) {
			this.controller.get("sortby").update(sb.label)
		}
	}, this);
};

ItemListAssistant.prototype.tapped = function(event) {
	Mojo.Log.info("Tapped item '%s'", event.item.title);
	Keyring.doIfPasswordValid(this.controller, this.ring,
			this.pushItemScene.bind(this, event.item.title));
};

ItemListAssistant.prototype.pushItemScene = function(title) {
	// Get the decrypted version of the item
	var item;
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

ItemListAssistant.prototype.setCategory = function(category) {
	if (category == '++edit++') {
		Keyring.doIfPasswordValid(this.controller, this.ring,
			this.controller.stageController.pushScene.
			bind(this.controller.stageController, "categories", this.ring));
		return;
	}
	if (category == undefined || category == this.category) return;
	Mojo.Log.info("Setting category to '%s'", category);
	var subset = [];
	this.category = category;
	if (category == -1 && this.filterString == '') {
		subset = this.ring.items;
	} else {
		this.ring.items.each(function(item) {
			if ((category == -1 || item.category == category)
					&& item.TITLE.include(this.filterString)) {
				subset.push(item);
			}
		}, this);
	}
	
	this.itemList.mojo.noticeUpdatedItems(0, subset);
	this.itemList.mojo.setLength(subset.length);
	this.itemList.mojo.setCount(subset.length);

	this.ring.prefs.category = category;
	this.ring.saveData();
	
	// Note the category in the header
	this.controller.get("category").update(this.ring.categories[category]);
	
	// Scroll back to the top, in case the list has shrunk
	this.itemList.mojo.revealItem(0, false);
};

ItemListAssistant.prototype.filterItems = function(filterString, listWidget, offset, count) {
	/* Filter visible entries based on case-insensitive match with entered text.
	 * 
	 * Note that this method is also called at scene setup time, and while
	 * scrolling the list, as more items are fetched. */
	var filterUpper = filterString.toUpperCase();
	Mojo.Log.info("Filtering on '%s', offset =%s", filterUpper, offset);
	var subset = [];
	var totalSubsetSize = 0;
	
	var i = 0;
	while (i < this.ring.items.length) {
		var item = this.ring.items[i];
        if (item.TITLE.include(filterUpper) &&
        		(this.category == -1 || item.category == this.category)) {
			if (subset.length < count && totalSubsetSize >= offset) {
				subset.push(item);
			}
			totalSubsetSize++;
		}
		i++;
	}
	Mojo.Log.info("Filtered down to %s items.", totalSubsetSize);
	
	//update the items in the list with the subset
	listWidget.mojo.noticeUpdatedItems(offset, subset);
	
	//set the list's length & count if we're not repeating the same filter string from an earlier pass
	if (this.filterString !== filterUpper) {
		Mojo.Log.info("Setting length/count to %s.", totalSubsetSize);
		listWidget.mojo.setLength(totalSubsetSize);
		listWidget.mojo.setCount(totalSubsetSize);
	}
	// Save the filter string for the next time
	this.filterString = filterUpper;
};

ItemListAssistant.prototype.activate = function(event) {
	Mojo.Log.info("activate");
	if (this.ring.itemsReSorted) {
		// Need to redisplay the item list
		// FIXME When we do this, if there was a filter set, it is retained,
		// but the value in the filter input is cleared.
		this.ring.itemsReSorted = false;
		this.controller.modelChanged(this.ring);
	}
	// Filter by category if needed
	this.setCategory(this.ring.prefs.category);
	Mojo.Event.listen(this.controller.get('ring-items'),
			Mojo.Event.listTap, this.tapped);
	Mojo.Event.listen(this.controller.get('ring-items'),
			Mojo.Event.listDelete, this.deleted);

	Keyring.activateLockout(this);
	
	this.setSortingStatus();
};

ItemListAssistant.prototype.deactivate = function(event) {
	Mojo.Event.stopListening(this.controller.get('ring-items'),
			Mojo.Event.listTap, this.tapped);
	Mojo.Event.stopListening(this.controller.get('ring-items'),
			Mojo.Event.listDelete, this.deleted);
	Keyring.deactivateLockout(this);
};

ItemListAssistant.prototype.cleanup = function(event) {
};
