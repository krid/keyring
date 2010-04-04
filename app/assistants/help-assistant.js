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

function HelpAssistant(ring) {
	this.ring = ring;
}

HelpAssistant.prototype.setup = function() {
	if (this.ring.errors.length > 0) {
		/* There are errors, display them unobtrusively, so that we can
		 * ask users to go look for them. */
		this.controller.get("errors").update("ERRORS:\n\n" +
			this.ring.errors.join("\n")).show();
		this.controller.get("errors-link").show();
	}
};

HelpAssistant.prototype.activate = function(event) {
	Keyring.activateLockout(this);
};


HelpAssistant.prototype.deactivate = function(event) {
	Keyring.deactivateLockout(this);
};

HelpAssistant.prototype.cleanup = function(event) {
};
