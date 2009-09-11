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
	
	// Callbacks used during initialization
	_itemsLoadedCallback: function() {},
	_cryptInfoLoadedCallback: function() {},
	_prefsLoadedCallback: function() {},

	_salt: '',
	
	_password: '',
	
	_passwordTime: '',
	
	_checkData: '',
	
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
	        
	test_db: {
		'foo': {title:'foo', username:'jblo', pass:'secret', url: '', notes:'wow!'},
	    'quux': {title:'quux', username:'weeble', pass:'grond', url: '', notes:''},
	    'wobblies': {title:'wobblies', username:'krid', pass:'out', url: 'www.zyx.com', notes:'booga booga\nbooga boo!'},
	    'This is a really long and boring name that goes on and on': {title:'This is a really long and boring name that goes on and on', username:'grizzle', pass:'a;lskdfj', url: '', notes:''},
	    'joshua': {title:'joshua', username:'krid', pass:'out', url: 'foo.net', notes:'booga booga\nbooga boo!'},
	    'freddy': {title:'freddy', username:'krid', pass:'out', url: '', notes:'booga booga\nbooga boo!'},
	    'jane': {title:'jane', username:'krid', pass:'out', url: '', notes:'booga booga\nbooga boo!'},
	    'jamie': {title:'jamie', username:'krid', pass:'out', url: '', notes:'booga booga\nbooga boo!'},
	    'howard': {title:'howard', username:'krid', pass:'out', url: '', notes:'booga booga\nbooga boo!'},
	    'google': {title:'google', username:'krid', pass:'out', url: '', notes:'booga booga\nbooga boo!'},
	    'foolish': {title:'foolish', username:'grizzle', pass:'a;lskdfj', url: '', notes:''},
	    'bar': {title:'bar', username:'panopsquat', pass:'bigsecret', url: '', notes:''}
	},
	
	DEPOT_OPTIONS: {
		name: 'keyring',
		version: 1,
		replace: false
	},
	
	CHECK_DATA_PLAINTEXT: 'elderberries',
	
	DEPOT_ITEMS_KEY: "items",
	
	DEPOT_CRYPT_KEY: "crypt-info",
	
	DEPOT_PREFS_KEY: "prefs",
	
	ENCRYPTED_ATTRS: ['username', 'pass', 'url', 'notes'],
	
	PLAINTEXT_ATTRS: ['title', 'created', 'viewed', 'modified'],

	initialize: function() {
		Mojo.Log.info("Initializing ring");
		this.sortBy = this._byTitle; // FIXME should be a pref
		this.depot = new Mojo.Depot(this.DEPOT_OPTIONS,
			null,
			function() {
				Mojo.Log.error("Failed to open database");
				throw new Error("Failed to open database.");
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
		// FIXME set timeout
		this._password = password;
		this._checkData = this.encrypt(this.CHECK_DATA_PLAINTEXT);
		this.firstRun = false;
		this.saveCryptInfo();
		this.updateTimeout();
		// FIXME re-encrypt the db
	},
	
	validatePassword: function(password) {
		Mojo.Log.info("Validating password");
		if (this.decrypt(this._checkData, password) == this.CHECK_DATA_PLAINTEXT) {
			Mojo.Log.info("Password validated");
			this._password = password;
			this.updateTimeout();
			return true;
		} else {
			Mojo.Log.info("invalid password");
			this._passwordTime = 0;
			return false;
		}
	},
	
	passwordValid: function() {
		if (this._password) {
			if ((new Date().getTime() - this._passwordTime) < this.prefs.timeout) {
				// Timeout not exceeded, reset it
				this.updateTimeout();
				return true;
			} else {
				// Timeout exceeded, clear password
				this._password = '';
			}
		} else {
			return false;
		}
	},
	
	clearPassword: function() {
		Mojo.Log.info("clearPassword");
		this._password = '';
		this._passwordTime = 0;
	},
	
	updateTimeout: function() {
		this._passwordTime = new Date().getTime();
	},
	
	loadDepotData: function(callback) {
		/* Set up a synchronizer that will call the supplied callback when
		 * all the loaders have finished. */
		var ring = this;
		var synchronizer = new Mojo.Function.Synchronize({
            syncCallback: function() {
				ring.depotDataLoaded = true;
				callback();
			},
            timeout: 3});
		this._itemsLoadedCallback = synchronizer.wrap(function() {});
		this._cryptInfoLoadedCallback = synchronizer.wrap(function() {});
		this._prefsLoadedCallback = synchronizer.wrap(function() {});

		this.depot.get(this.DEPOT_ITEMS_KEY,
			this.loadItems.bind(this),
			function(error) {
				this._itemsLoadedCallback();
			    Mojo.Log.error("Could not fetch items: " + error);
			    throw new Error("Failed to fetch items.");
	        }
		);
		this.depot.get(this.DEPOT_CRYPT_KEY,
			this.loadCryptInfo.bind(this),
			function(error) {
				this._cryptInfoLoadedCallback();
				Mojo.Log.error("Could not fetch crypt-info: " + error);
				throw new Error("Failed to fetch crypto information.");
			}
		);
		this.depot.get(this.DEPOT_PREFS_KEY,
			this.loadPrefs.bind(this),
			function(error) {
				Mojo.Log.error("Could not fetch prefs: " + error);
				this.errors.push("Failed to fetch preferences.");
				this._prefsLoadedCallback();
			}
		);
	},
	
	loadItems: function(obj) {
		// Read hash of items from the depot
		if (obj) {
			this.db = obj;
			Mojo.Log.info("Loaded item db");
		}
		this.buildItemList();
		this._itemsLoadedCallback();
	},

	saveItems: function() {
		Mojo.Log.info("Saving items db");
		this.depot.add(this.DEPOT_ITEMS_KEY, this.db,
			function() {
				Mojo.Log.info("Items db saved");
			},
			function(error) {
				var errmsg = "Failed to save items: " + error;
				Mojo.Log.error(errmsg);
				throw new Error(errmsg);
			}
		);
	},
	
	loadCryptInfo: function(obj) {
		// Read hash of crypto info from the depot
		if (obj) {
			Mojo.Log.info("Loaded crypt info");
			this._salt = obj.salt;
			this._checkData = obj.checkData;
		}
		if (this._salt) {
			this.firstRun = false;
			Mojo.Log.info("checkData:", this._checkData, "salt:", this._salt);
		} else {
			// First run or factory reset, generate salt
			this._salt = this.generatePassword({characters: 12, all: true});
			Mojo.Log.info("Generated new salt: ", this._salt);
		}
		this._cryptInfoLoadedCallback();
	},

	saveCryptInfo: function() {
		Mojo.Log.info("Saving crypt info");
		this.depot.add(this.DEPOT_CRYPT_KEY, {
				salt: this._salt,
				checkData: this._checkData
			}, function() {
				Mojo.Log.info("Crypt info saved");
			}, function(error) {
				var errmsg = "Failed to save crypto info: " + error;
				Mojo.Log.error(errmsg);
				throw new Error(errmsg);
			}
		);
	},
	
	loadPrefs: function(obj) {
		// Read hash of prefs info from the depot
		if (obj) {
			this.prefs = obj;
			Mojo.Log.info("Loaded prefs object");
		} else {
			Mojo.Log.info("Using default prefs");
			this.prefs = Object.clone(this.DEFAULT_PREFS);
		}
		this._prefsLoadedCallback();
	},
	
	savePrefs: function() {
		Mojo.Log.info("Saving prefs");
		this.depot.add(this.DEPOT_PREFS_KEY, this.prefs,
			function() {
				Mojo.Log.info("Prefs saved");
			},
			function(error) {
				var errmsg = "Failed to save preferences: " + error;
				Mojo.Log.error(errmsg);
				throw new Error(errmsg);
			}
		);
	},
	
	/*
	 * Clear the database and the items list, save the empty db.  If
	 * factoryReset is true, clear prefs and salt, otherwise make a new salt
	 * and checkData.
	 */
	clearDatabase: function(factoryReset) {
		Mojo.Log.info("clearDatabase, factoryReset='%s'", factoryReset);
		if (! this.passwordValid) {
			Mojo.Log.warn("Attempt to clear db without valid password.");
			return;
		}
		this.db = {};
		this.items = [];
		this.saveItems();
		if (factoryReset) {
			this._password = '';
			this._passwordTime = 0;
			this._salt = '';
			this._checkData = '';
			this.firstRun = true;
			this.prefs = Object.clone(this.DEFAULT_PREFS);
			this.savePrefs();
		} else {
			this._salt = this.generatePassword({characters: 12, all: true});
			this._checkData = this.encrypt(this.CHECK_DATA_PLAINTEXT);
		}
		this.saveCryptInfo();
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
		Mojo.Log.error("numFuncs", numFuncs);
		var pw = '';
		for (var i = 0; i < model.characters; i++) {
			// Add a character from a randomly picked generator
			Mojo.Log.error("addchar");
			pw += funcs[Math.floor(Math.random() * numFuncs)]();
		}
		Mojo.Log.error("generated", pw);
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
			var errmsg = "Unable to decrypt key; " + e.name + ": " + e.message;
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
			Mojo.Log.warn("Attempt to clear db without valid password.");
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
		this.saveItems();
		this.buildItemList();
		this.updateTimeout();
	},
	
	noteItemView: function(title) {
		Mojo.Log.info("noteItemView");
		this.db[title].viewed = new Date().getTime();
		this.saveItems();
		this.buildItemList();
		this.updateTimeout();
	},
	
	deleteItem: function(item) {
		Mojo.Log.info("deleteItem");
		delete this.db[item.title];
		this.saveItems();
		this.buildItemList();
		this.updateTimeout();
	},
	
	buildItemList: function() {
		Mojo.Log.info("buildItemList, sortby:", this.prefs.sortBy);
		var sortBy = this.prefs.sortBy;
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
		if (! this._password) {
			Mojo.Log.warn("No password in encrypt.");
			throw this.PasswordError;
		}
		var key = b64_sha256(this._salt + this._password);
        var encrypted = Mojo.Model.encrypt(key, data);
        Mojo.Log.info("Mojo.Model.encrypt done, encrypted='%s'", encrypted);
        return encrypted;
	},

    decrypt: function(data, tempPass) {
		Mojo.Log.info("decrypt");
		var pass = tempPass ? tempPass : this._password;
		var key = b64_sha256(this._salt + pass);
		Mojo.Log.info("Calling Mojo.Model.decrypt. data='%s'", data);
        var plaintext = Mojo.Model.decrypt(key, data);
        return plaintext;
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