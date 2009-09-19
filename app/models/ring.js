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
	
	DEFAULT_PREFS: {
		sortBy: 'TITLE',
		timeout: 30 * 1000, // in milliseconds
		generatorPrefs: {
			characters: 8,
			lowcase: true,
			cap: true,
			num: true,
			sym: false
		}
	},

	prefs: {},
	
	errors: [],
	
	items: [],
	
	db: {},

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
	SCHEMA_VERSION: 2,
	
	DEPOT_DATA_KEY: "data",
	
	DEPOT_VERSION_KEY: "version",
	
	ENCRYPTED_ATTRS: ['username', 'pass', 'url', 'notes'],
	
	PLAINTEXT_ATTRS: ['title', 'created', 'viewed', 'modified'],

	initialize: function() {
		Mojo.Log.info("Initializing ring");
		this.depot = new Mojo.Depot(this.DEPOT_OPTIONS,
			null,
			function(error) {
				var errmsg = "Failed to open database: " + error;
				errors.push(errmsg);
				Mojo.Log.error(errmsg);
			}
		);
	},
	
	newPassword: function(password) {
		Mojo.Log.info("newPassword");
		if (! password) {
			Mojo.Log.Info("no password");
			throw new Error("You must enter a password.");
		}
		if (Object.keys(this.db).length > 0) {
			Mojo.Log.warn("Changing pw not supported");
			throw new Error("Changing the password is not currently supported.");
		}
		this._key = b64_sha256(this._salt + password);;
		this._checkData = this.encrypt(this._key);
		this.saveData();
		this.updateTimeout();
		this.firstRun = false;
		// FIXME re-encrypt the db
	},
	
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
	
	clearPassword: function() {
		Mojo.Log.info("clearPassword");
		this._key = '';
		this._passwordTime = 0;
	},
	
	updateTimeout: function() {
		this._passwordTime = new Date().getTime();
	},
	
	initDepotReader: function(callback) {
		this._dataLoadedCallback = callback;
		this.depot.get(this.DEPOT_VERSION_KEY,
			this._loadDepotData.bind(this),
			function(error) {
				// FIXME proper error handling
			    Mojo.Log.error("Could not init Depot reader: " + error);
	        }
		);
	},
	
	_loadDepotData: function(versionObj) {
		var depotVersion;
		if (versionObj) {
			depotVersion = versionObj.version;
		} else {
			// First releases didn't have a version key in Depot
			depotVersion = 0;
		}
		Mojo.Log.info("Current depotVersion", depotVersion);
		if (depotVersion != this.SCHEMA_VERSION) {
			new Upgrader(depotVersion, this).upgrade();
		} else {
			this.depot.get(this.DEPOT_DATA_KEY,
				this._loadDataHandler.bind(this),
				function(error) {
					// FIXME proper error handling
					Mojo.Log.error("Could not fetch data: " + error);
				}
			);
		}
	},
	
	_loadDataHandler: function(obj) {
		if (obj) {
			this.db = obj.db;
			this.prefs = obj.prefs;
			this._salt = obj.crypt.salt;
			this._checkData = obj.crypt.checkData;
			this.depotDataLoaded = true;
			Mojo.Log.info("Depot data loaded");
		} else {
			Mojo.Log.error("No data in Depot");
			// FIXME error handling
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
		}
		this.buildItemList();
		this._dataLoadedCallback();
	},

	saveData: function(upgrading) {
		Mojo.Log.info("Saving data");
		var data = {
			db: this.db,
			crypt: {
				salt: this._salt,
				checkData: this._checkData
			},
			prefs: this.prefs
		};
		
		this.depot.add(this.DEPOT_DATA_KEY, data,
			function() {
				Mojo.Log.info("Data saved");
			},
			function(error) {
				var errmsg = "Failed to save data: " + error;
				Mojo.Log.error(errmsg);
			}
		);
		if (this.firstRun || upgrading) {
			Mojo.Log.info("Writing schema version");
			this.depot.add(this.DEPOT_VERSION_KEY,
				{ 'version': this.SCHEMA_VERSION },
				function() {
					Mojo.Log.info("Version saved");
				},
				function(error) {
					var errmsg = "Failed to save version: " + error;
					Mojo.Log.error(errmsg);
				}
			);
		}
	},
	
	exportableData: function() {
		if (! this.passwordValid()) {
			Mojo.Log.warn("Attempt to export db without valid password.");
			throw this.PasswordError;
		}
		var data = {
			schema_version: this.SCHEMA_VERSION,
			salt: this._salt,
			db: this.encrypt(JSON.stringify(this.db))
		};
		return data;
	},
	
	/*
	 * Clear the database and the items list, save the empty db.  If
	 * factoryReset is true, clear prefs, salt and checkData.
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
			this._salt = '';
			this._checkData = '';
			this.firstRun = true;
			this.prefs = Object.clone(this.DEFAULT_PREFS);
			// Clear everything that was ever in the depot.
			this.depot.removeAll(function() {
					Mojo.Log.info("Depot cleared");
				},
				function(error) {
					Mojo.Log.error("Failed to clear depot: ", error);
				}
			);
		} else {
			this.saveData();
		}
		return true;
	},
	
	/*
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
	
	getItem: function(title) {
		Mojo.Log.info("getItem");
		// Get a copy of the item, since we'll be adding in unencrypted data
		var item = Object.clone(this.db[title]);
		var encrypted_data = item.encrypted_data;
		try {
			var decrypted_json = this.decrypt(encrypted_data);
			var decrypted_obj = JSON.parse(decrypted_json);
		}
		catch(e) {
			var errmsg = "Unable to decrypt item; " + e.name + ": " + e.message;
			Mojo.Log.error(errmsg);
			throw new Error(errmsg);
		}
		for (var i = 0; i < this.ENCRYPTED_ATTRS.length; i++) {
			var attr = this.ENCRYPTED_ATTRS[i];
			item[attr] = decrypted_obj[attr];
		}
		this.updateTimeout();
		return item;
	},
	
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
		
		var item = {};
		var i, attr;
		for (i = 0; i < this.PLAINTEXT_ATTRS.length; i++) {
			attr = this.PLAINTEXT_ATTRS[i];
			item[attr] = newData[attr];
		}
		// We cache an uppercase version of the title for sorting
		item.TITLE = newTitle.toUpperCase();
		
		var toBeEncrypted = {};
		for (i = 0; i < this.ENCRYPTED_ATTRS.length; i++) {
			attr = this.ENCRYPTED_ATTRS[i];
			toBeEncrypted[attr] = newData[attr];
		}
		var jsonified = JSON.stringify(toBeEncrypted);
		var encryptedJson = this.encrypt(jsonified);
		item.encrypted_data = encryptedJson;
		
		if (oldTitle) {
			if (newTitle != oldTitle) {
				// Delete old item from db hash
				delete this.db[oldTitle];
			}
			item.changed = item.viewed = new Date().getTime();
		} else {
			// Newly created item
			item.created = item.changed = item.viewed = new Date().getTime();
		}
		
		this.db[newTitle] = item;
		this.saveData();
		this.buildItemList();
		this.updateTimeout();
	},
	
	noteItemView: function(title) {
		Mojo.Log.info("noteItemView");
		this.db[title].viewed = new Date().getTime();
		this.saveData();
		this.buildItemList();
		this.updateTimeout();
	},
	
	deleteItem: function(item) {
		Mojo.Log.info("deleteItem");
		delete this.db[item.title];
		this.saveData();
		this.buildItemList();
		this.updateTimeout();
	},
	
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
	
    encrypt: function(data) {
		Mojo.Log.info("encrypting");
		if (! this._key) {
			Mojo.Log.warn("Attempt to encrypt w/o valid key.");
			throw this.PasswordError;
		}
        var encrypted = Mojo.Model.encrypt(this._key, data);
        Mojo.Log.info("Mojo.Model.encrypt done, encrypted='%s'", encrypted);
        return encrypted;
	},

    decrypt: function(data, tempKey) {
		Mojo.Log.info("decrypt");
		var key = tempKey ? tempKey : this._key;
		Mojo.Log.info("Calling Mojo.Model.decrypt. data='%s'", data);
        return Mojo.Model.decrypt(key, data);
	},
	
	formatDate: function(millis) {
		Mojo.Log.info("formatDate");
		if (typeof(millis) != "number") {
			return '';
		}
		var date = new Date(millis);
		date.getHours()
		return date.getFullYear() + '-' + this._zeropad(date.getMonth() + 1) + 
			'-' + this._zeropad(date.getDate()) + ' ' +
			this._zeropad(date.getHours()) + ':' + this._zeropad(date.getMinutes())
	},
	
	_zeropad: function(val) {
		if (val < 10) {
			val = "0" + val;
		}
		return val;
	}
});