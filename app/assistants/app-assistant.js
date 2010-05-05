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

function AppAssistant() {
}

AppAssistant.prototype.setup = function() {
	this.ring = new Ring();
	Keyring.version = Mojo.appInfo.version;
};

AppAssistant.prototype.handleLaunch = function(launchParams) {
	Keyring.log("handleLaunch");
    var mainStageController = this.controller.getStageController(Keyring.MainStageName);
    
    if (launchParams) {
    	Mojo.Log.error("Keyring was passed launch params, but doesn't use them. params=%j",
    			launchParams);
    }
    /* Call to bring up the main UI.  See if this is the initial launch or
     * a re-launch. */
    if (mainStageController) {
        // Stage already exists, bring it to the front by focusing its window.
        Keyring.log("Main Stage Exists");
        mainStageController.popScenesTo("locked");
        mainStageController.activate();
    } else {
        Keyring.log("Creating Main Stage");
        this.controller.createStageWithCallback(
    		{name: Keyring.MainStageName, assistantName: "StageAssistant", lightweight: true},
            this.pushOpeningScene.bind(this),
            "card");
    }
};

AppAssistant.prototype.pushOpeningScene = function(stageController) {
	Keyring.log("pushOpeningScene");
	/* FIXME this is a somewhat dirty way of making ring available to
	 * the stage assistant. */
	stageController.ring = this.ring;
	stageController.pushScene('locked', this.ring);
};

/**
 * handleCommand - called to handle app menu selections
 */ 
AppAssistant.prototype.handleCommand = function(event) {
	var stageController = this.controller.getActiveStageController();
	var currentScene = stageController.activeScene();
	if(event.type === Mojo.Event.command) {
	    switch(event.command) {
	        case "do-aboutKeyring":
	        	this.ring.updateTimeout();
	            currentScene.showAlertDialog({
	                onChoose: function(value) {},
	                title: $L("Keyring — Easy password management"),
	                message: $L("Version #{version} Copyright 2009-2010, Dirk Bergstrom.  Released under the GPLv3.").interpolate({version: Keyring.version}),
	                choices:[{label:$L("OK"), value:""}]
	            });
	        break;
	         
	        case "do-keyRingPrefs":
	        	Keyring.doIfPasswordValid(currentScene, this.ring,
					stageController.pushScene.
					bind(this.controller, "preferences", this.ring)
				);
        	break;
	         
	        case "do-keyRingActions":
	        	Keyring.doIfPasswordValid(currentScene, this.ring,
					stageController.pushScene.
					bind(stageController, "actions", this.ring)
				);
        	break;
	        	
	        case "do-keyRingCategories":
	        	Keyring.doIfPasswordValid(currentScene, this.ring,
	        			stageController.pushScene.
	        			bind(stageController, "categories", this.ring)
	        	);
	        	break;
	        	
	        case "do-keyRingHelp":
	        	this.ring.updateTimeout();
	            stageController.pushScene("help", this.ring);
	        break;
	    }
	}
};
