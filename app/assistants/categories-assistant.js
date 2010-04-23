function CategoriesAssistant(ring) {
	this.ring = ring;
	this.model = {items: []};
}

CategoriesAssistant.prototype.setup = function() {
	Keyring.log("rendering category list");
	this.controller.get("main-hdr").update($L({value: "Categories",
		key: "title of the 'Categories' scene"}));
	this.controller.setupWidget(Mojo.Menu.appMenu,
			Keyring.MenuAttr, Keyring.MenuModel);
	this.model.items = this.ring.categoriesForMojo(true, true);
	
	var listAttributes = {
		itemTemplate: 'categories/category',
		fixedHeightItems: true,
		swipeToDelete: true,
		reorderable: false,
		addItemLabel: $L("Add new")
	};
	this.controller.setupWidget('categories', listAttributes, this.model);
	this.list = this.controller.get('categories');

	this.baseTextFieldAttrs = {
		holdToEnable: true, 
		autoFocus: false,
		focusMode: Mojo.Widget.focusSelectMode,
		changeOnKeyPress: false, // send propertyChange event only when focus lost
		textCase: Mojo.Widget.steModeLowerCase,
		autoReplace: false, // SmartTextEngine
		modelProperty: 'label',
		requiresEnterKey: false
	};
	this.model.items.each(function(itemModel) {
		this.controller.setupWidget('cat-'+itemModel.value, this.baseTextFieldAttrs, itemModel);
	}, this);
	this.deleted = this.deleted.bindAsEventListener(this);
	this.addCategory = this.addCategory.bindAsEventListener(this);
	this.categoryEdited = this.categoryEdited.bindAsEventListener(this);
	
	// Make sure nothing is focused
	this.controller.setInitialFocusedElement(null);
};

CategoriesAssistant.prototype.deleted = function(event) {
	Keyring.log("Deleting item '%s'", event.item.label);
	this.ring.updateTimeout();
	this.ring.deleteCategory(event.item.value);
};

CategoriesAssistant.prototype.addCategory = function(event) {
	Keyring.log("Adding new category");
	this.ring.updateTimeout();
	this.controller.showDialog({
		template: "textfield-dialog",
		assistant: new CategoryDialogAssistant(this.controller, this.ring,
			this.categoryAdded.bind(this))
	});
};

CategoriesAssistant.prototype.categoryAdded = function(newIndex) {
	/* There's a lot of monkey motion here because I don't understand something...
	 * If you leave out any of these steps, either the old or the new list items
	 * aren't properly set up.  I tried using this.list.mojo.noticeAddedItems(),
	 * but that didn't work.  */
	this.ring.updateTimeout();
	// Tell the framework that we have a new list of items
	this.model.items = this.ring.categoriesForMojo(true, true);
	this.controller.modelChanged(this.model);
	// Find the item that was just added
	var newItem;
	this.model.items.each(function(item) {
		if (item.value == newIndex) {
			newItem = item;
		}
	});
	// Set up the list item for it
	this.controller.setupWidget('cat-'+newIndex, this.baseTextFieldAttrs,
		newItem);
	this.controller.modelChanged(this.model);
	// Hang events on the items in the list
	this.model.items.each(function(item) {
		Mojo.Event.listen(this.controller.get('cat-'+item.value),
				Mojo.Event.propertyChange, this.categoryEdited);
	}, this);
};

CategoriesAssistant.prototype.categoryEdited = function(event) {
	this.ring.updateTimeout();
	if (event.value !== event.oldValue) {
		Keyring.log("Category '%s' changed to '%s'", event.oldValue, event.value);
		this.ring.editCategory(event.model.value, event.value);
	}
};


CategoriesAssistant.prototype.activate = function(event) {
	this.model.items.each(function(item) {
		Mojo.Event.listen(this.controller.get('cat-'+item.value),
				Mojo.Event.propertyChange, this.categoryEdited);
	}, this);

	Mojo.Event.listen(this.list, Mojo.Event.listDelete, this.deleted);
	Mojo.Event.listen(this.list, Mojo.Event.listAdd, this.addCategory);

	Keyring.activateLockout(this);
};


CategoriesAssistant.prototype.deactivate = function(event) {
	this.model.items.each(function(item) {
		Mojo.Event.stopListening(this.controller.get('cat-'+item.value),
				Mojo.Event.propertyChange, this.categoryEdited);
	}, this);

	Mojo.Event.stopListening(this.list, Mojo.Event.listDelete, this.deleted);
	Mojo.Event.stopListening(this.list, Mojo.Event.listAdd, this.addCategory);

	Keyring.deactivateLockout(this);
};


/*
 * The new category dialog.
 */
var CategoryDialogAssistant = Class.create ({
	initialize: function(controller, ring, callback) {
		this.controller = controller;
	    this.ring = ring;
	    this.callbackOnSuccess = callback;
	},

	setup: function(widget) {
	    this.widget = widget;
	    
	    this.controller.get("dialog-title").update($L("Enter New Category"));
	        
	    this.controller.setupWidget(
	        "text",
	        {
	              hintText: $L("Name"),
	              autoFocus: true,
	              changeOnKeyPress: true,
	              limitResize: true,
	              autoReplace: false,
	              enterSubmits: true,
	              requiresEnterKey: true
	        },
	        this.categoryModel = {value: ''});
	
	    this.controller.listen("text", Mojo.Event.propertyChange,
	        this.keyPressHandler.bind(this));
	    
	    this.saveButtonModel = {label: $L("Save"), disabled: false};
	    this.controller.setupWidget("saveButton", {type: Mojo.Widget.defaultButton},
	        this.saveButtonModel);
	    this.saveHandler = this.save.bindAsEventListener(this);
	    this.controller.listen("saveButton", Mojo.Event.tap,
	        this.saveHandler);
	    
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
		    this.save();
		}
	},

	save: function() {
		Keyring.log("save");
		var retval = this.ring.editCategory(undefined, this.categoryModel.value);
		if (retval[0]) {
			this.widget.mojo.close();
			// Pass new category index to callback
			this.callbackOnSuccess(retval[2]);
		} else {
			Keyring.log("Bad category");
			this.controller.get("errmsg").update(retval[1]);
			this.controller.get("text").mojo.focus();
		}
	},

	//cleanup  - remove listeners
	cleanup: function() {
		this.controller.stopListening("saveButton", Mojo.Event.tap,
		    this.saveHandler);
		this.controller.stopListening("cancelButton", Mojo.Event.tap,
			this.widget.mojo.close);
		this.controller.stopListening("text", Mojo.Event.propertyChange,
	        this.keyPressHandler.bind(this));
	}
});
