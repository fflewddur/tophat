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

let depFailures = [];
let missingLibs = [];

const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
let GTop = null;
let Cpu = null;
let Mem = null;
let Net = null;
try {
    // eslint-disable-next-line no-unused-vars
    GTop = imports.gi.GTop;
    Cpu = Me.imports.lib.cpu;
    Mem = Me.imports.lib.mem;
    Net = Me.imports.lib.net;
} catch (err) {
    depFailures.push(err);
    missingLibs.push('GTop');
}
const Config = Me.imports.lib.config;
const _ = Config.Domain.gettext;

// Declare `tophat` in the scope of the whole script so it can
// be accessed in both `enable()` and `disable()`
let tophat = null;

class TopHat {
    constructor() {
        let settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.tophat');

        this.addTimeout = 0;
        this.cpu = new Cpu.TopHatCpuIndicator(settings);
        this.mem = new Mem.TopHatMemIndicator(settings);
        this.net = new Net.TopHatNetIndicator(settings);
    }

    addToPanel() {
        // Wait 500 ms to allow other indicators to queue up first
        this.addTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            Main.panel.addToStatusArea(`${Me.metadata.name} Network Indicator`, this.net);
            Main.panel.addToStatusArea(`${Me.metadata.name} Memory Indicator`, this.mem);
            Main.panel.addToStatusArea(`${Me.metadata.name} CPU Indicator`, this.cpu);
            this.addTimeout = 0;
        });
    }

    destroy() {
        if (this.addTimeout !== 0) {
            GLib.source_remove(this.addTimeout);
            this.addTimeout = 0;
        }
        this.cpu.destroy();
        this.mem.destroy();
        this.net.destroy();
    }
}

// eslint-disable-next-line no-unused-vars
function init() {
    ExtensionUtils.initTranslations(Me.metadata.uuid);
}

// eslint-disable-next-line no-unused-vars
function enable() {
    log(`[${Me.metadata.name}] enabling version ${Me.metadata.version}`);

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

    log(`[${Me.metadata.name}] enabled`);
}

// eslint-disable-next-line no-unused-vars
function disable() {
    log(`[${Me.metadata.name}] disabling version ${Me.metadata.version}`);

    if (tophat !== null) {
        tophat.destroy();
        tophat = null;
    }

    log(`[${Me.metadata.name}] disabled`);
}
