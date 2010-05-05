/**
 * @author Dirk Bergstrom
 * 
 * Keyring for webOS - Easy password management on your phone.
 * Copyright (C) 20092010, Dirk Bergstrom, keyring@otisbean.com
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
 * Keyring is a "static" helper object containing various methods used
 * throughout the UI code.  It's a slushpile, and doubtless an indication
 * of unclean coding practices... 
 */
var Keyring = {
		
	MainStageName: "ui-stage",

	/* Setup App Menu for all scenes; all menu actions handled in
	 * StageAssistant.handleCommand() */
	MenuAttr: {omitDefaultItems: true},

	MenuModel: {
		visible: true,
		items: [ 
	        {label: $L("About Keyring..."), command: "do-aboutKeyring"},
	        Mojo.Menu.editItem,
	        {label: $L("Edit Categories..."), command: "do-keyRingCategories"},    
	        {label: $L("Database Actions..."), command: "do-keyRingActions"},    
	        {label: $L("Preferences..."), command: "do-keyRingPrefs"},    
	        {label: $L("Help..."), command: "do-keyRingHelp"}            
	    ]
	},

	/* If the user has entered a valid password within the timeout window, or they
	 * enter it into the dialog, return true. */
	doIfPasswordValid: function(sceneController, ring, callback, preventCancel) {
		if (ring.passwordValid()) {
			callback();
		} else {
			sceneController.showDialog({
				template: "password-dialog",
				preventCancel: preventCancel ? true : false,
				assistant: new PasswordDialogAssistant(sceneController, ring,
					callback, preventCancel)
			});
		}
	},

	/* Called by scenes on timeout or app deactivation/minimization. */
	lockout: function(stageController, ring) {
		var sceneName = stageController.topScene().sceneName;
		Keyring.log("Timeout or Deactivate in scene", sceneName);
		ring.clearPassword();
		if (ring.prefs.lockoutTo === 'close-app') {
			stageController.popScenesTo('locked');
		} else if (sceneName !== ring.prefs.lockoutTo) {
			// Don't pop scene if we're already on the lockoutTo page.
			stageController.popScenesTo(ring.prefs.lockoutTo);
		}
	},
	
	activateLockout: function(sceneAssistant) {
		Keyring.log("activateLockout for scene",
			sceneAssistant.controller.stageController.topScene().sceneName);
		// Clear password after idle timeout
		sceneAssistant.cancelIdleTimeout = sceneAssistant.controller.setUserIdleTimeout(
			sceneAssistant.controller.sceneElement,
			Keyring.lockout.bind(Keyring, sceneAssistant.controller.stageController, sceneAssistant.ring),
			sceneAssistant.ring.prefs.timeout);
	},
	
	deactivateLockout: function(sceneAssistant) {
		Keyring.log("deactivateLockout for scene",
			sceneAssistant.controller.stageController.topScene().sceneName);
		sceneAssistant.cancelIdleTimeout();
	},
	
	/* Wrapper around Mojo.Log.info that only logs if debuggingEnabled is set
	 * in framework_config.json.  Used as belt-and-suspenders to ensure that
	 * information is not exposed in the logfile. */
	log: function() {
		if (Mojo.Environment.frameworkConfiguration.debuggingEnabled) {
			Mojo.Log.info.apply(Mojo.Log, arguments);
		}
	}
};
