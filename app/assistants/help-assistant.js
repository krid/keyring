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

function HelpAssistant() {
}

HelpAssistant.prototype.setup = function() {
}

HelpAssistant.prototype.activate = function(event) {
	this.cancelIdleTimeout = this.controller.setUserIdleTimeout(this.controller.sceneElement,
			this.ring.clearPassword.bind(this.ring), this.ring.prefs.timeout);
}


HelpAssistant.prototype.deactivate = function(event) {
	this.cancelIdleTimeout();
}

HelpAssistant.prototype.cleanup = function(event) {
}
