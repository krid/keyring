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

/**
 * Schema version #3 added categories.
 */
var _V2 = Class.create ({
	
	ring: null,
	
	initialize: function(ring) {
		Mojo.Log.info("Initializing V2 upgrader");
		this.ring = ring;
	},
	
	upgrade: function() {
		/* Tell the ring to load its data, but insert our processData()
		 * method in the pipeline. */
		this.ring._loadRingData(this.processData.bind(this));
	},
	
	/*
	 * This is the method that does the actual upgrade work, by translating
	 * old-style data to new style.
	 * It will (probably) need to be modified each time a new schema is created.
	 * 
	 * In this case, we're just pumping all the items thru ring._upgradeItem(),
	 * which will add the new category attribute.
	 */
	processData: function(timedOut) {
		Mojo.Log.info("V2 upgrader processing data");
		
		Object.values(this.ring.db).each(function(item) {
			this.ring.db[item.title] = this.ring._upgradeItem(item);
		}, this);
		
		Mojo.Log.info("V2 upgrader saving processed data");
		// Need to pass 'true' to tell saveData to write out the new schema_version.
		this.ring.saveData(true);
		this.ring._postLoadTasks();
	}
});

/**
 * An Upgrader upgrades from the given version to current.
 */
var Upgrader = Class.create ({
	
	worker: null,
	
	initialize: function(version, ring) {
		Mojo.Log.info("Initializing upgrader for version", version);
		if (version === 2) {
			this.worker = new _V2(ring);
		} 
	},

	upgrade: function() {
		this.worker.upgrade();
	}
});
