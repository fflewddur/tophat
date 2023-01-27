'use strict';

// TopHat: An elegant system resource monitor for the GNOME shell
// Copyright (C) 2020 Todd Kulesza <todd@dropline.net>

// This file is part of TopHat.

// TopHat is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// TopHat is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with TopHat. If not, see <https://www.gnu.org/licenses/>.

/* exported init, enable, disable */

let depFailures = [];
let missingLibs = [];

const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
let GTop = null;
let Cpu = null;
let Mem = null;
let Net = null;
let FS = null;
try {
    // eslint-disable-next-line no-unused-vars
    GTop = imports.gi.GTop;
    Cpu = Me.imports.lib.cpu;
    Mem = Me.imports.lib.mem;
    Net = Me.imports.lib.net;
    FS = Me.imports.lib.fs;
} catch (err) {
    log(`[${Me.metadata.name}] Error loading dependencies: ${err}`);
    depFailures.push(err);
    missingLibs.push('GTop');
}
const Config = Me.imports.lib.config;
const Container = Me.imports.lib.container;
const _ = Config.Domain.gettext;

const MenuPosition = {
    LEFT_EDGE: 0,
    LEFT: 1,
    CENTER: 2,
    RIGHT: 3,
    RIGHT_EDGE: 4,
};

// Declare `tophat` in the scope of the whole script so it can
// be accessed in both `enable()` and `disable()`
let tophat = null;

class TopHat {
    constructor() {
        this.configHandler = new Config.ConfigHandler();
        this.container = new Container.TopHatContainer();
        this.cpu = new Cpu.CpuMonitor(this.configHandler);
        this.mem = new Mem.MemMonitor(this.configHandler);
        this.net = new Net.NetMonitor(this.configHandler);
        this.fs = new FS.FileSystemMonitor(this.configHandler);
        this.container.addMonitor(this.cpu);
        this.container.addMonitor(this.mem);
        this.container.addMonitor(this.fs);
        this.container.addMonitor(this.net);
        this.configHandler.connect_void('position-in-panel', () => {
            this.moveWithinPanel();
        });
    }

    addToPanel() {
        let pref = this._getPreferredPanelBoxAndPosition();
        Main.panel.addToStatusArea('TopHat', this.container, pref.position, pref.box);
        this.container.monitors.forEach(monitor => {
            // log(`Adding menu to manager for ${monitor.name}`);
            Main.panel.menuManager.addMenu(monitor.menu);
            monitor.refresh();
        });
    }

    moveWithinPanel() {
        let pref = this._getPreferredPanelBoxAndPosition();
        let boxes = {
            left: Main.panel._leftBox,
            center: Main.panel._centerBox,
            right: Main.panel._rightBox,
        };
        let boxContainer = boxes[pref.box] || this._rightBox;
        Main.panel._addToPanelBox('TopHat', this.container, pref.position, boxContainer);
    }

    _getPreferredPanelBoxAndPosition() {
        let box = 'right';
        let position = 0;
        switch (this.configHandler.positionInPanel) {
        case MenuPosition.LEFT_EDGE:
            box = 'left';
            position = 0;
            break;
        case MenuPosition.LEFT:
            box = 'left';
            position = -1;
            break;
        case MenuPosition.CENTER:
            box = 'center';
            position = 1;
            break;
        case MenuPosition.RIGHT:
            box = 'right';
            position = 0;
            break;
        case MenuPosition.RIGHT_EDGE:
            box = 'right';
            position = -1;
            break;
        }
        return {box, position};
    }

    destroy() {
        this.container.destroy();
        this.configHandler.destroy();
    }
}

function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    // log(`[${Me.metadata.name}] enabling version ${Me.metadata.version}`);

    if (depFailures.length > 0) {
        log(`[${Me.metadata.name}] missing dependencies, showing problem reporter instead`);
        const Problem = Me.imports.lib.problem;
        tophat = new Problem.TopHatProblemReporter();

        let msg = _(`It looks like your computer is missing GIRepository (gir) bindings for the following libraries: ${missingLibs.join(', ')}`);
        tophat.setMessage(msg);
        tophat.setDetails(depFailures.join('\n'));

        Main.panel.addToStatusArea(`${Me.metadata.name} Problem Reporter`, tophat);
    } else {
        tophat = new TopHat();
        tophat.addToPanel();
    }

    // log(`[${Me.metadata.name}] enabled`);
}

function disable() {
    if (tophat !== null) {
        tophat.destroy();
        tophat = null;
    }
}
