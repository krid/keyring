/**
 * @author Dirk Bergstrom
 *
 * Code used to upgrade the db from one version to the next.
 * 
 * Violates encapsulation in horrible ways.
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

var _V0 = Class.create ({

	DEPOT_ITEMS_KEY: "items",
	
	DEPOT_CRYPT_KEY: "crypt-info",
	
	DEPOT_PREFS_KEY: "prefs",
	
	// Callbacks used during initialization
	_itemsLoadedCallback: function() {},
	_cryptInfoLoadedCallback: function() {},
	_prefsLoadedCallback: function() {},

	errors: [],

	db: null,
	prefs: null,
	_salt: '',
	_checkData: '',
	ring: null,
	depot: null,
	
	initialize: function(ring) {
		Mojo.Log.info("Initializing V0 upgrader");
		this.ring = ring;
		this.depot = ring.depot;
	},
	
	upgrade: function() {
		this.loadDepotData(this.processData.bind(this));
	},
	
	/*
	 * This is the method that does the actual upgrade work, by translating
	 * old-style data to new style.
	 * It will need to be modified each time a new schema is created.
	 * 
	 * IMPORTANT: Because version 1/2 had no version key in the depot, we'll
	 * get here on the first fun of any version that has the ability to
	 * upgrade from those early versions.
	 */
	processData: function(timedOut) {
		Mojo.Log.info("V0 upgrader processing data; timedOut='%s'", timedOut);
		if (this.db || this._checkData || this.prefs) {
			// Found actual version 1/2 data
			var dataObj = {
				db: this.db,
				crypt: {
					salt: this._salt,
					checkData: this._checkData
				},
				prefs: this.prefs
			};
			// Add in new "import" & "export" prefs
			dataObj.prefs.import_ = this.ring.DEFAULT_PREFS.import_;
			dataObj.prefs.export_ = this.ring.DEFAULT_PREFS.export_;
			
			this.ring._loadDataHandler(dataObj);
			this.ring.saveData(true);
			
			// Add a helper function to handle the old checkData format
			this.ring._upgradeCheckData = function(tmpKey) {
				Mojo.Log.info("Upgrading checkData");
				if (this.decrypt(this._checkData, tmpKey) == 'elderberries') {
					this._key = tmpKey;
					this._checkData = this.encrypt(tmpKey);
				}
			}.bind(this.ring);

			// Finally, toss out the old data
			this.deleteOldData();
			
		} else {
			Mojo.Log.info("Upgrader found no version 1/2 data, this is the first run");
			this.ring._salt = this.ring.generatePassword({characters: 12, all: true});
			this.ring.prefs = Object.clone(this.ring.DEFAULT_PREFS);
			this.ring.depotDataLoaded = true;
			this.ring._dataLoadedCallback();
		}
	},
	
	// Get rid of the old data
	deleteOldData: function() {
		Mojo.Log.info("VO upgrader deleting old depot data");
		[this.DEPOT_ITEMS_KEY, this.DEPOT_CRYPT_KEY, this.DEPOT_PREFS_KEY].each(
			function(key) {
				Mojo.Log.info("VO upgrader deleting depot key", key);
				/* discard is not implemented as of Mojo 1.1, even though
				 * it's listed in Palm's API docs.  Jerks. */
				try {
					this.depot.discard(key,
						function() {
							Mojo.Log.info("VO upgrader discarded old depot key '%s'", key);
						},
						function(error) {
							Mojo.Log.error("V0 upgrader failed to discard key '%s': %s", key, error);
						}
					);
				}
				catch(e) {
					// Rrrgh, no discard.  Overwrite with empty object.
					this.depot.add(key, {},
						function() {
							Mojo.Log.info("VO upgrader overwrote old depot key '%s'", key);
						},
						function(error) {
							Mojo.Log.error("V0 upgrader failed to overwrite key '%s': %s", key, error);
						}
					);
				}
			}, this);
	},
	
	// Read data from the old version's depot
	loadDepotData: function(callback) {
		/* Set up a synchronizer that will call the supplied callback when
		 * all the loaders have finished. */
		var synchronizer = new Mojo.Function.Synchronize({
            syncCallback: callback});
		this._itemsLoadedCallback = synchronizer.wrap(function() {});
		this._cryptInfoLoadedCallback = synchronizer.wrap(function() {});
		this._prefsLoadedCallback = synchronizer.wrap(function() {});

		this.depot.get(this.DEPOT_ITEMS_KEY,
			this.loadItems.bind(this),
			function(error) {
				this._itemsLoadedCallback();
			    Mojo.Log.error("V0 upgrader Could not fetch items: " + error);
	        }
		);
		this.depot.get(this.DEPOT_CRYPT_KEY,
			this.loadCryptInfo.bind(this),
			function(error) {
				this._cryptInfoLoadedCallback();
				Mojo.Log.error("V0 upgrader Could not fetch crypt-info: " + error);
			}
		);
		this.depot.get(this.DEPOT_PREFS_KEY,
			this.loadPrefs.bind(this),
			function(error) {
				Mojo.Log.error("V0 upgrader Could not fetch prefs: " + error);
				this._prefsLoadedCallback();
			}
		);
	},
	
	loadItems: function(obj) {
		// Read hash of items from the depot
		if (obj) {
			this.db = obj;
			Mojo.Log.info("V0 upgrader Loaded item db");
		}
		this._itemsLoadedCallback();
	},
	
	loadCryptInfo: function(obj) {
		// Read hash of crypto info from the depot
		if (obj) {
			Mojo.Log.info("V0 upgrader Loaded crypt info");
			this._salt = obj.salt;
			this._checkData = obj.checkData;
		}
		this._cryptInfoLoadedCallback();
	},
	
	loadPrefs: function(obj) {
		// Read hash of prefs info from the depot
		if (obj) {
			this.prefs = obj;
			Mojo.Log.info("V0 upgrader Loaded prefs object");
		} else {
			this.prefs = null;
			Mojo.Log.info("V0 upgrader found no prefs object");
		}
		this._prefsLoadedCallback();
	}
});

var Upgrader = Class.create ({
	
	worker: null,
	
	initialize: function(version, ring) {
		Mojo.Log.info("Initializing upgrader for version", version);
		if (version === 0) {
			this.worker = new _V0(ring);
		}
	},

	upgrade: function() {
		this.worker.upgrade();
	}
});
