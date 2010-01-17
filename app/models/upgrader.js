/**
 * @author Dirk Bergstrom
 *
 * Code used to upgrade the db from one version to the next.
 * 
 * Violates encapsulation in horrible ways.
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

var _V2And3Upgrader = Class.create ({
	
	ring: null,
	
	loadedData: null,
	
	initialize: function(ring) {
		Mojo.Log.info("Initializing _V2And3Upgrader");
		this.ring = ring;
	},
	
	upgrade: function() {
		/* Tell the ring to call us when the user enters their password. */
		this.ring._upgradeDecryptMethod = this.processData.bind(this);

		this.ring.depot.get(this.ring.DEPOT_DATA_KEY,
			function(obj) {
				Mojo.Log.info("Upgrader loaded depot data");
				// Stash the data 
				this.loadedData = obj;
				// Pull the salt out of the data, because ring needs it soon
				this.ring._salt = obj.crypt.salt;
				// return control to the UI to get a password
				this.ring._dataLoadedCallback();
			}.bind(this),
			function(error) {
				var errmsg = "Could not fetch data: " + error;
				this.errors.push(errmsg);
			    Mojo.Log.error(errmsg);
			    this.ring._dataLoadedCallback(errmsg);
			}.bind(this)
		);
	},
	
	/*
	 * This is the method that does the actual upgrade work, by translating
	 * old-style data to new style.
	 * It will (probably) need to be modified each time a new schema is created.
	 * 
	 * In this case, we're just pumping all the items thru ring._upgradeItem(),
	 * which will add the new category attribute and salt the encrypted bits.
	 */
	processData: function(tmpKey) {
		Mojo.Log.info("upgrader.processData()");
		/* See if the supplied password is valid by checking if it decrypts
		 * the stored checkData. */
		if (Mojo.Model.decrypt(tmpKey, this.loadedData.crypt.checkData) != tmpKey) {
			// BZZZZT! Worng password!
			return false;
		}
		/* Make the supplied key the ring's key, so that calls to ring.encrypt()
		 * in _buildItem() will work when we call _upgradeItem(). */
		this.ring._key = tmpKey;
		
		// Wrap the checkData with curly braces to conform to the new regime.
		this.loadedData.crypt.checkData = this.ring.encrypt('{' + tmpKey + '}', 8);
		
		// Here we do the actual upgrade work
		Object.values(this.loadedData.db).each(function(item) {
			this.loadedData.db[item.title] = this.ring._upgradeItem(item, tmpKey);
		}, this);
		
		this.ring._processDecryptedData(this.loadedData);
		// Need to pass 'true' to tell saveData to write out the new schema_version.
		this.ring.saveData(true);
		this.ring.upgradeDecryptMethod = null;
		return true;
	}
});


/**
 * An Upgrader upgrades from the given version to current.
 */
var Upgrader = Class.create ({
	
	worker: null,
	
	initialize: function(version, ring) {
		Mojo.Log.info("Initializing upgrader for version", version);
		if (version === 2 || version == 3) {
			this.worker = new _V2And3Upgrader(ring);
		} 
	},

	upgrade: function() {
		this.worker.upgrade();
	}
});
