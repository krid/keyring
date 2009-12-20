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

var Ring = Class.create ({

	PasswordError: { name: "PasswordError", message: "Re-enter Password" },
	
	firstRun: true,
	
	depotDataLoaded: false,
	
	itemsReSorted: false,
	
	// Callback used during initialization
	_dataLoadedCallback: function() {},

	_salt: '',
	
	_key: '',
	
	_passwordTime: '',
	
	_checkData: '',
	
	_upgradeCheckData: null,
	
	// import conflict handling options
	resolutions: {
		keep: {code: "keep", label: "Keep existing"},
		import_: {code: "import", label: "Use import"},
		newer: {code: "newer", label: "Use newer"},
		update: {code: "update", label: "Update only"}
	},
	
	onDeactivateOptions: {
		lock: {code: "lock", label: "Lock"},
		lockSoon: {code: "lockSoon", label: "Lock in 10 sec"},
		noLock: {code: "noLock", label: "Don't lock"}
	},
	
	/* If prefs.onDeactivate == 'lockSoon', wait this many seconds after
	 * app deactivation to lock */
	lockSoonDelay: 10,
	
	DEFAULT_PREFS: {
		sortBy: 'TITLE',
		category: -1,
		hideEmpty: true,
		timeout: 30 * 1000, // in milliseconds
		requireInitialPassword: false,
		lockoutTo: 'locked',
		onDeactivate: 'lock',
		generatorPrefs: {
			characters: 8,
			lowcase: true,
			cap: true,
			num: true,
			sym: false
		},
		import_: {
			/* Import from a file on /media/internal by default.  Also supports
			 * import from 'clipboard' & 'url'. */
			source: 'url',
			// Only overwrite existing items with newer data
			/* XXX??? I'd like to refer to "this.resolutions.newer", but there
			 * is no "this" when we get here. */ 
			resolution: 'newer',
			// Don't import preferences
			prefs: false,
			// Default filename & URL for import
			filename: '',
			url: ''
		},
		export_: {
			destination: 'clipboard',
			url: ''
		}
	},
	
	prefs: {},
	
	errors: [],
	
	items: [],
	
	db: {},
	
	// FIXME need a way to use DEFAULT_CATEGORIES (create a firstRun method?)
	DEFAULT_CATEGORIES: {"-1": "All", 0: "Unfiled"},
	
	categories: {"-1": "All", 0: "Unfiled"},

	DEPOT_OPTIONS: {
		name: 'keyring',
		version: 1,
		replace: false
	},

	/* I'm aware that Depot/HTML5DB has a 'version' attribute, but the Depot
	 * API doesn't appear to provide a sane way to use it.  As of webOS 1.1,
	 * the docs claim that a version mismatch will result in an error code of
	 * "2", however I don't get a code, much less anything with a 2 in it.
	 * So, rather than guess at what Palm intends, I'm going to do my own
	 * versioning.  This also allows me to read the version number, and fire
	 * off the appropriate updater if it's too old.
	 */
	SCHEMA_VERSION: 3,
	
	DEPOT_DATA_KEY: "data",
	
	DEPOT_VERSION_KEY: "version",
	
	ENCRYPTED_ATTRS: ['username', 'pass', 'url', 'notes'],

	ENCRYPTED_DEFAULTS: {username: '', pass: '', url: '', notes: ''},
	
	PLAINTEXT_ATTRS: ['title', 'category'],
	
	PLAINTEXT_DEFAULTS: {title: '', category: 0},

	DATE_ATTRS: ['created', 'viewed', 'changed'],

	initialize: function() {
		Mojo.Log.info("Initializing ring");
		this.depot = new Mojo.Depot(this.DEPOT_OPTIONS,
			null,
			function(error) {
				var errmsg = "Failed to open database: " + error;
				this.errors.push(errmsg);
				Mojo.Log.error(errmsg);
			}
		);
	},
	
	newPassword: function(oldPassword, newPassword) {
		Mojo.Log.info("newPassword");
		if (! newPassword) {
			Mojo.Log.info("no password");
			throw new Error("You must enter a password.");
		}
		if (! this.firstRun && ! this.validatePassword(oldPassword)) {
			var errmsg = "Attempt to change password without valid password.";
			Mojo.Log.warn(errmsg);
			throw new Error(errmsg);
		}
		var oldKey = this._key;
		this._key = b64_sha256(this._salt + newPassword);
		if (Object.keys(this.db).length > 0) {
			// Re-encrypt all items
			Object.values(this.db).each(function(item) {
				// Decrypt using the old key, and re-encrypt with the new one
				var tmpData = this.decrypt(item.encrypted_data, oldKey);
				item.encrypted_data = this.encrypt(tmpData);
			}, this);
		}
		this._checkData = this.encrypt(this._key);
		this.saveData();
		this.updateTimeout();
		this.firstRun = false;
	},
	
	/**
	 * Check the submitted password for validity; call updateTimeout() if valid.
	 */
	validatePassword: function(password) {
		Mojo.Log.info("Validating password");
		var tmpKey = b64_sha256(this._salt + password);
		Mojo.Log.info("_upgradeCheckData=%j", this._upgradeCheckData);
		if (this._upgradeCheckData) {
			this._upgradeCheckData(tmpKey);
		}
		if (this.decrypt(this._checkData, tmpKey) == tmpKey) {
			Mojo.Log.info("Password validated");
			this._key = tmpKey;
			this.updateTimeout();
			return true;
		} else {
			Mojo.Log.info("invalid password");
			this._passwordTime = 0;
			return false;
		}
	},
	
	/**
	 * Return true if we have a valid key and the timeout hasn't passed; calls
	 * updateTimeout() when true.
	 */
	passwordValid: function() {
		if (this._key) {
			if ((new Date().getTime() - this._passwordTime) < this.prefs.timeout) {
				// Timeout not exceeded, reset it
				this.updateTimeout();
				return true;
			} else {
				// Timeout exceeded, clear password
				this._key = '';
				return false;
			}
		} else {
			return false;
		}
	},
	
	/**
	 * Lock Keyring by clearing the key and killing the timeout.
	 */
	clearPassword: function() {
		Mojo.Log.info("clearPassword");
		this._key = '';
		this._passwordTime = 0;
	},
	
	/**
	 * Reset the timeout counter.
	 */
	updateTimeout: function() {
		this._passwordTime = new Date().getTime();
	},
	
	/**
	 * Called to start the data loading process.  Kicks off the read of the
	 * schema version.
	 * 
	 * The loading process is broken down into a number of methods, because
	 * of asynchronous Depot reads, and to allow the Upgrader to intervene in
	 * the process as needed.
	 */
	initDepotReader: function(callback) {
		if (this.depotDataLoaded) {
			// TODO is this always what we want to do?
			return;
		}
		this._dataLoadedCallback = callback;
		this.depot.get(this.DEPOT_VERSION_KEY,
			this._startDepotLoad.bind(this),
			function(error) {
				var errmsg = "Could not init Depot reader: " + error;
				this.errors.push(errmsg);
			    Mojo.Log.error(errmsg);
	        }
		);
	},
	
	/**
	 * Checks the schema version stored in Depot, and either kicks off an
	 * upgrade, or calls _loadRingData().
	 */
	_startDepotLoad: function(versionObj) {
		var depotVersion;
		if (versionObj) {
			depotVersion = versionObj.version;
			// Avoid race condition on app startup
			this.firstRun = false;
		} else {
			// First releases didn't have a version key in Depot
			depotVersion = 0;
		}
		Mojo.Log.info("Current depotVersion", depotVersion);
		if (depotVersion != this.SCHEMA_VERSION) {
			new Upgrader(depotVersion, this).upgrade();
		} else {
			this._loadRingData(this._postLoadTasks.bind(this));
		}
	},
	
	/**
	 * Kicks off the load of the actual keyring data, which is handled by
	 * _loadDataHandler().
	 */
	_loadRingData: function(callAfterLoadDataHandler) {
		Mojo.Log.info("_loadRingData()");
		this.depot.get(this.DEPOT_DATA_KEY,
			this._loadDataHandler.bind(this, callAfterLoadDataHandler),
			function(error) {
				var errmsg = "Could not fetch data: " + error;
				this.errors.push(errmsg);
			    Mojo.Log.error(errmsg);
			}
		);
	},
	
	/**
	 * Processes the actual keyring data, and calls _postLoadTasks().
	 */
	_loadDataHandler: function(nextStep, obj) {
		Mojo.Log.info("_loadDataHandler()");
		if (obj) {
			this.db = obj.db;
			this.categories = obj.categories;
			this.prefs = obj.prefs;
			this._salt = obj.crypt.salt;
			this._checkData = obj.crypt.checkData;
			this.depotDataLoaded = true;
			Mojo.Log.info("Depot data loaded");
		} else {
			var errmsg = "No data in Depot";
			this.errors.push(errmsg);
		    Mojo.Log.error(errmsg);
		}
		if (this._salt) {
			this.firstRun = false;
			Mojo.Log.info("checkData:", this._checkData, "salt:", this._salt);
		} else {
			// First run or factory reset, generate salt
			this._salt = this.generatePassword({characters: 12, all: true});
			Mojo.Log.info("Generated new salt: ", this._salt);
		}
		if (! this.prefs) {
			// Copy default prefs
			this.prefs = Object.clone(this.DEFAULT_PREFS);
		} else {
			// Fill in any missing prefs with defaults
			this.prefs = $H(this.DEFAULT_PREFS).update(this.prefs).toObject();
		}
		// make sure we always have the "all" and "unfiled" categories
		this.categories = $H(this.categories).update(this.DEFAULT_CATEGORIES).toObject();
		nextStep();
	},
	
	/**
	 * Handles setup of the item list and categories list.
	 */
	_postLoadTasks: function() {
		Mojo.Log.info("_postLoadTasks()");
		// Build and sort the list of items for display
		this.buildItemList();
		
		// Finally we're done, inform the consumer.
		this._dataLoadedCallback();
	},

	/**
	 * Returns the object that is stored in the db and emitted from export().
	 */
	_dataObject: function() {
		return {
			db: this.db,
			categories: this.categories,
			crypt: {
				salt: this._salt,
				checkData: this._checkData
			},
			prefs: this.prefs
		};
	},
	
	/**
	 * Save our data to the depot.  If upgrading or this.firstRun is true, also
	 * write out the schema version. 
	 */
	saveData: function(upgrading) {
		Mojo.Log.info("Saving data");
		this.depot.add(this.DEPOT_DATA_KEY, this._dataObject(),
			function() {
				Mojo.Log.info("Data saved");
			},
			function(error) {
				var errmsg = "Failed to save data: " + error;
				this.errors.push(errmsg);
				Mojo.Log.error(errmsg);
			}
		);
		if (this.firstRun || upgrading) {
			Mojo.Log.info("Writing schema version");
			this.depot.add(this.DEPOT_VERSION_KEY,
				{ 'version': this.SCHEMA_VERSION },
				function() {
					Mojo.Log.info("Schema version saved");
				},
				function(error) {
					var errmsg = "Failed to save schema version: " + error;
					this.errors.push(errmsg);
					Mojo.Log.error(errmsg);
				}
			);
		}
	},
	
	/**
	 * Return a JSON string of data suitable for export/import. 
	 */
	exportableData: function() {
		if (! this.passwordValid()) {
			Mojo.Log.warn("Attempt to export db without valid password.");
			throw this.PasswordError;
		}
		var data = {
			schema_version: this.SCHEMA_VERSION,
			salt: this._salt,
			db: this.encrypt(JSON.stringify(this._dataObject()))
		};
		return JSON.stringify(data);
	},
	
	/**
	 * Import data.
	 * 
	 * On success, calls callback with args of true and the number of items
	 * imported.  On error, passes false and an error message.
	 * 
	 * FIXME an exception somewhere in the import process will result in a
	 * partial import.
	 */
	importData: function(jsonData, behavior, usePrefs, password, callback) {
		var data, errmsg, obj, decryptedJson, tmpKey, emptyDb;
		Mojo.Log.info("Importing behavior=%s, usePrefs=%s", behavior, usePrefs);
		try {
			data = JSON.parse(jsonData);
		}
		catch(e) {
			errmsg = "Unable to parse data; " + e.name + ": " + e.message;
			Mojo.Log.warn(errmsg);
			callback(false, errmsg);
		}
		if (data.schema_version > this.SCHEMA_VERSION) {
			errmsg = "Importing data from later versions of Keyring is not supported.  Please upgrade first.";
			Mojo.Log.warn(errmsg);
			callback(false, errmsg);
		} // Data from older versions will upgrade cleanly (at least for now).
		
		if (password || data.salt != this._salt) {
			// imported data encrypted with a different password or salt
			tmpKey = b64_sha256(data.salt + password);
		}
		decryptedJson = this.decrypt(data.db, tmpKey);
		try {
			obj = JSON.parse(decryptedJson);
		}
		catch(e) {
			errmsg = "Can't parse decrypted data (bad password?); " + e.name + ": " +
				e.message;
			Mojo.Log.warn(errmsg);
			callback(false, errmsg);
		}
		
		if (usePrefs) {
			// Merge imported prefs into ours
			this.prefs = $H(this.prefs).update(obj.prefs).toObject();
		}

		var categoryMap = false;
		if (obj.categories) {
			// Find the next available category number
			var nextCategory = parseInt(Object.keys(this.categories).sort().pop()) + 1;
			// Build a reverse hash of category name to number
			var revCats = {};
			Object.keys(this.categories).each(function(catKey) {
				revCats[this.categories[catKey]] = catKey;
			}, this);
			/* Go through the imported categories and build a map of import
			 * category number to our category number, adding new categories
			 * as needed. */
			categoryMap = {};
			Object.keys(obj.categories).each(function(catKey) {
				var catName = obj.categories[catKey];
				if (revCats[catName]) {
					// We have this category, map to our number (which may be the same)
					categoryMap[catKey] = revCats[catName];
				} else {
					// We don't have this category, add it
					this.categories[nextCategory] = catName;
					categoryMap[catKey] = nextCategory;
					nextCategory++;
				}
			}, this);
			
			// Do we have anything in the category map?
			if (Object.values(categoryMap).length === 0) {
				// Nope, don't bother with mapping later on.
				categoryMap = false;
			}
		}
		
		// Now, let's see what we do with the imported items
		emptyDb = (Object.keys(this.db).length === 0);
		var added = 0, updated = 0;
		Object.values(obj.db).each(function(item) {
			var used = false;
			var title = item.title;
			var existing = this.db[title];
			if (existing) {
				if (behavior === this.resolutions.import_.code) {
					updated++;
					used = true;
				} else if ((behavior === this.resolutions.update.code ||
						    behavior === this.resolutions.newer.code) &&
						    existing.changed < item.changed) {
					updated++;
					used = true;
				}
			} else if (emptyDb || behavior === this.resolutions.import_.code ||
					   behavior === this.resolutions.keep.code ||
					   behavior === this.resolutions.newer.code) {
				added++;
				used = true;
			}
			if (used) {
				// Upgrade the item to the current schema 
				this.db[title] = this._upgradeItem(item, tmpKey, categoryMap);
			}
		}, this);
		this.buildItemList();
		this.saveData();
		this.itemsReSorted = true;
		callback(true, updated, added);
	},
	
	/**
	 * Take an item from any (possibly old) schema, possibly encrypted with a different
	 * key, and transform it into the current schema, encrypted with our key.
	 * 
	 * If key is not supplied, don't do anything with the encrypted data.
	 * 
	 * Fills in non-existent attributes with appropriate defaults.
	 */
	_upgradeItem: function(item, key, categoryMap) {
		Mojo.Log.info("_upgradeItem");
		var tmpItem = $H(item);
		if (key) {
			var tmpData = this.decrypt(item.encrypted_data, key);
			try {
				encryptedObj = JSON.parse(tmpData);
			}
			catch(e) {
				errmsg = "Can't parse decrypted data (bad password?); " + e.name + ": " +
					e.message;
				Mojo.Log.warn(errmsg);
				// FIXME what to do here?
				throw new Error(errmsg);
			}
	
			// Add the (formerly) encrypted attrs to the item
			tmpItem.update(encryptedObj);
			// Remove the old encrypted blob from the item
			tmpItem.unset('encrypted_data');
		}
		
		// Munge category if necessary
		if (categoryMap) {
			tmpItem.set('category', categoryMap[tmpItem.get('category')]);
		}
		
		// And fix it up to conform to the current schema
		return this._buildItem(tmpItem.toObject());
	},

	/**
	 * Clear the database and the items list, save the empty db.  If
	 * factoryReset is true, clear prefs, categories and checkData & generate
	 * a new salt.
	 */
	clearDatabase: function(factoryReset) {
		Mojo.Log.info("clearDatabase, factoryReset='%s'", factoryReset);
		if (! this.passwordValid()) {
			Mojo.Log.warn("Attempt to clear db without valid password.");
			return false;
		}
		this.db = {};
		this.items = [];
		if (factoryReset) {
			this._key = '';
			this._passwordTime = 0;
			this._checkData = '';
			this._salt = this.generatePassword({characters: 12, all: true});
			// FIXME need to find a way to use DEFAULT_CATEGORIES
			this.categories = {"-1": "All", 0: "Unfiled"};
			this.firstRun = true;
			this.prefs = Object.clone(this.DEFAULT_PREFS);
			// Clear everything that was ever in the depot.
			this.depot.removeAll(function() {
					Mojo.Log.info("Depot cleared");
				},
				function(error) {
					var errmsg = "Failed to clear depot: " + error;
					this.errors.push(errmsg);
					Mojo.Log.error(errmsg);
				}
			);
		} else {
			this.saveData();
		}
		return true;
	},
	
	/**
	 * Delete the supplied category, and set the category of all affected
	 * items to "Unfiled" (0). 
	 */
	deleteCategory: function(toDelete) {
		if (toDelete < 1) {
			var errmsg = "Can't delete the \"All\" & \"Unfiled\" categories.";
			Mojo.Log.error(errmsg);
			throw new Error(errmsg);
		}
		if (! this.passwordValid()) {
			Mojo.Log.warn("Attempt to delete category w/o valid password.");
			return false;
		}

		var numAffected = 0;
		Object.values(this.db).each(function(item) {
			if (item.category == toDelete) {
				item.category = 0;
				numAffected++;
			}
		}, this);
		
		delete(this.categories[toDelete]);
		if (this.prefs.category == toDelete) {
			this.prefs.category = -1;
		}
		this.saveData();
	},
	
	/**
	 * Edit an existing category name, or (if value is undef) add a new category.
	 * 
	 * TODO strip whitespace from newLabel.
	 */
	editCategory: function(value, newLabel) {
		Mojo.Log.info("editCategory");
		if (value === 0) {
			var errmsg = "Can't edit the \"All\" & \"Unfiled\" categories.";
			Mojo.Log.error(errmsg);
			return [false, errmsg];
		}
		if (! this.passwordValid()) {
			var errmsg = "Attempt to edit categories w/o valid password.";
			Mojo.Log.warn(errmsg);
			return [false, errmsg];
		}
		if (value && ! this.categories[value]) {
			var errmsg = 'Attempt to edit non-existent category with value "' + value;
			Mojo.Log.warn(errmsg);
			return [false, errmsg];
		}
		if (! value) {
			var existing = Object.values(this.categories);
			for (var i = 0; i < existing.length; i++) {
				if (newLabel == existing[i]) {
					return [false, 'Category "' + newLabel + '" already exists.'];
				}
			}
			// New category, find the lowest unused value
			value = parseInt(Object.keys(this.categories).sort().pop()) + 1;
		}
		this.categories[value] = newLabel;
		this.saveData();
		return [true, newLabel];
	},
	
	/**
	 * Generate a random password of the desired length, with characters
	 * picked from one or more classes.
	 * 
	 * XXX??? This doesn't guarantee that the generated password will actually
	 * contain a character from every class desired.
	 */
	generatePassword: function(model) {
		Mojo.Log.info("generatePassword");
		if (! model.characters || model.characters < 1) {
			var errmsg = "Can't deliver a password of less than one character.";
			Mojo.Log.error(errmsg);
			throw new Error(errmsg);
		}
		if (!(model.lowcase || model.cap || model.num || model.sym || model.all)) {
			var errmsg = "Must choose at least one of lowercase, uppercase, numbers or symbols.";
			Mojo.Log.error(errmsg);
			throw new Error(errmsg);
		}
		/* Build a list of random character generation functions.
		 * Alphabetic functions are pushed more to adjust the frequency
		 * distribution of characters in a way that will yield somewhat
		 * more typeable passwords. */
		var funcs = [];
		if (model.lowcase || model.all) {
			funcs.push(this._rndLowcase, this._rndLowcase, this._rndLowcase);
		}
		if (model.cap || model.all) { funcs.push(this._rndCap, this._rndCap); }
		if (model.num || model.all) { funcs.push(this._rndNum); }
		if (model.sym || model.all) { funcs.push(this._rndSym); }
		var numFuncs = funcs.length;
		var pw = '';
		for (var i = 0; i < model.characters; i++) {
			// Add a character from a randomly picked generator
			pw += funcs[Math.floor(Math.random() * numFuncs)]();
		}
		return pw;
	},
	
	_rndLowcase: function() {
		return String.fromCharCode(Math.floor(Math.random() * 26) + 97);
	},
	
	_rndCap: function() {
		return String.fromCharCode(Math.floor(Math.random() * 26) + 65);
	},
	
	_rndNum: function() {
		return Math.floor(Math.random() * 10);
	},
	
	_rndSym: function() {
		var syms = "!@#$%^&*()_+-={}|[]\\:\";'<>?,./";
		return syms[Math.floor(Math.random() * 30)];
	},
	
	/**
	 * Return a decrypted copy of the item corresponding to the given title.
	 * 
	 * TODO This will barf if this.db[title] doesn't exist.
	 */
	getItem: function(title) {
		Mojo.Log.info("getItem");
		var decrypted_obj;
		// Get a copy of the item, since we'll be adding in unencrypted data
		var item = Object.clone(this.db[title]);
		var encrypted_data = item.encrypted_data;
		try {
			var decrypted_json = this.decrypt(encrypted_data);
			decrypted_obj = JSON.parse(decrypted_json);
		}
		catch(e) {
			var errmsg = "Unable to decrypt item; " + e.name + ": " + e.message;
			Mojo.Log.error(errmsg);
			this.errors.push(errmsg);
			throw new Error(errmsg);
		}
		for (var i = 0; i < this.ENCRYPTED_ATTRS.length; i++) {
			var attr = this.ENCRYPTED_ATTRS[i];
			item[attr] = decrypted_obj[attr];
		}
		this.updateTimeout();
		return item;
	},
	
	/**
	 * Update or create an item from the given data.
	 */
	updateItem: function(oldTitle, newData) {
		Mojo.Log.info("updateItem");
		if (! this.passwordValid) {
			Mojo.Log.warn("Attempt to update item without valid password.");
			throw this.PasswordError;
		}
		var newTitle = newData.title;
		if (newTitle != oldTitle && this.db[newTitle]) {
			var errmsg = "An entry with title \"" + newTitle +"\" already exists.";
			Mojo.Log.error(errmsg);
			throw new Error(errmsg);
		}
		
		var item = this._buildItem(newData);
		
		if (oldTitle) {
			if (newTitle != oldTitle) {
				// Delete old item from db hash
				delete this.db[oldTitle];
			}
			item.changed = item.viewed = new Date().getTime();
		}

		this.db[newTitle] = item;
		this.saveData();
		this.buildItemList();
		this.updateTimeout();
	},
	
	/**
	 * Given an object, return an item formatted for the current schema, with
	 * the appropriate encrypted data.
	 */
	_buildItem: function(newData) {
		Mojo.Log.info("_buildItem");
		var item = {};
		var i, attr;
		for (i = 0; i < this.PLAINTEXT_ATTRS.length; i++) {
			attr = this.PLAINTEXT_ATTRS[i];
			item[attr] = newData.hasOwnProperty(attr) ?
					newData[attr] : this.PLAINTEXT_DEFAULTS[attr];
		}
		// We cache an uppercase version of the title for sorting
		item.TITLE = newData.title.toUpperCase();
		for (i = 0; i < this.DATE_ATTRS.length; i++) {
			attr = this.DATE_ATTRS[i];
			item[attr] = newData.hasOwnProperty(attr) ?
					newData[attr] : new Date().getTime();
		}
		// Make sure category is a number, not a string
		item.category = parseInt(item.category);
		
		/* Don't mess with encrypted data if the item isn't decrypted (like
		 * when we get here from the upgrader). */
		if (newData.hasOwnProperty('encrypted_data')) {
			item.encrypted_data = newData.encrypted_data;
		} else {
			var toBeEncrypted = {};
			for (i = 0; i < this.ENCRYPTED_ATTRS.length; i++) {
				attr = this.ENCRYPTED_ATTRS[i];
				toBeEncrypted[attr] = newData.hasOwnProperty(attr) ?
						newData[attr] : this.ENCRYPTED_DEFAULTS[attr];
			}
			var jsonified = JSON.stringify(toBeEncrypted);
			var encryptedJson = this.encrypt(jsonified);
			item.encrypted_data = encryptedJson;
		}
		
		return item;
	},
	
	/**
	 * Set the 'viewed' time on the item of the given title, and save the
	 * whole db.
	 */
	noteItemView: function(title) {
		Mojo.Log.info("noteItemView");
		this.db[title].viewed = new Date().getTime();
		this.saveData();
		this.buildItemList();
		this.updateTimeout();
	},
	
	/**
	 * Delete the item for the given title.
	 */
	deleteItem: function(item) {
		Mojo.Log.info("deleteItem");
		delete this.db[item.title];
		this.saveData();
		this.buildItemList();
		this.updateTimeout();
	},
	
	/**
	 * Build the sorted item list, used by the main scene.
	 */
	buildItemList: function() {
		var sortBy = this.prefs.sortBy || 'TITLE';
		Mojo.Log.info("buildItemList, sortby:", this.prefs.sortBy);
		this.items = Object.values(this.db).sort(function(x, y) {
	      var a = x[sortBy];
	      var b = y[sortBy];
	      if (a > b) {
	    	  return (sortBy == "TITLE") ? 1 : -1;
	      }
	      if (a < b) {
	    	  return (sortBy == "TITLE") ? -1 : 1;
	      }
	      return 0;
	    });
	},
	
	/**
	 * Encrypt the given data with our key.
	 */
    encrypt: function(data) {
		Mojo.Log.info("encrypting");
		if (! this._key) {
			Mojo.Log.warn("Attempt to encrypt w/o valid key.");
			throw this.PasswordError;
		}
        var encrypted = Mojo.Model.encrypt(this._key, data);
        if (this.debug) Mojo.Log.info("Mojo.Model.encrypt done, encrypted='%s'", encrypted);
        return encrypted;
	},

	/**
	 * Decrypt the given data, using the supplied key, or our key.
	 */
    decrypt: function(data, tempKey) {
		Mojo.Log.info("decrypt");
		var key = tempKey ? tempKey : this._key;
		if (this.debug) Mojo.Log.info("Calling Mojo.Model.decrypt. data='%s'", data);
        return Mojo.Model.decrypt(key, data);
	},
	
	/**
	 * Return the categories as a list of label/value/command objects, suitable
	 * for use in various Mojo situations.
	 */
	categoriesForMojo: function(excludeFrom) {
		var cats = [];
		Object.keys(this.categories).sort().each(function(cat) {
			if (cat <= excludeFrom) return;
			cats.push({label: this[cat], value: cat, command: cat});
		}, this.categories);
		return cats;
	},
	
	/**
	 * Returns an item with all default values, to be used in the item creation
	 * scene.
	 */
	emptyItem: function() {
		return $H(this.PLAINTEXT_DEFAULTS).update(this.ENCRYPTED_DEFAULTS).toObject();
	},
	
	/**
	 * Format epoch milliseconds as an ISO date, with optional HH:mm.
	 */
	formatDate: function(millis, includeTime) {
		if (typeof(millis) != "number") {
			return '';
		}
		var date = new Date(millis);
		date.getHours();
		var formatted = date.getFullYear() + '-' + this._zeropad(date.getMonth() + 1) + 
			'-' + this._zeropad(date.getDate());
		if (includeTime) {
			formatted += ' ' + this._zeropad(date.getHours()) + ':' +
			    this._zeropad(date.getMinutes());
		}
		return formatted;
	},
	
	_zeropad: function(val) {
		if (val < 10) {
			val = "0" + val;
		}
		return val;
	}
});