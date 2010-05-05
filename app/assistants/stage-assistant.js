/**
 * @author Dirk Bergstrom
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

function StageAssistant() {
	this.cancelIdleLockoutId = false;
}

StageAssistant.prototype.setup = function() {
	Keyring.log("StageAssistant.setup");
	Mojo.Event.listen(this.controller.document,
		Mojo.Event.stageDeactivate, this.windowDeactivated.bind(this));
	Mojo.Event.listen(this.controller.document,
			Mojo.Event.stageActivate, this.windowActivated.bind(this));
};

StageAssistant.prototype.windowActivated = function() {
	Keyring.log("windowActivated in scene", this.controller.topScene().sceneName);
	if (this.cancelIdleLockoutId) {
		window.clearTimeout(this.cancelIdleLockoutId);
	}
	this.cancelIdleLockoutId = false;
};

StageAssistant.prototype.windowDeactivated = function() {
	var scene = this.controller.topScene();
	Keyring.log("windowDeactivated in scene", scene.sceneName);
	switch (this.controller.ring.prefs.onDeactivate) {
		case 'lock':
			Keyring.lockout(this.controller, this.controller.ring);
			break;
		case 'lockSoon':
			this.cancelIdleLockoutId =
				Keyring.lockout.delay(this.controller.ring.lockSoonDelay, this.controller, this.controller.ring);
			break;
		default:
			// noLock, do nothing
	}
};
