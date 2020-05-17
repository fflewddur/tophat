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

const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Cpu = Me.imports.lib.cpu;
const Mem = Me.imports.lib.mem;
const Net = Me.imports.lib.net;

class TopHat {
    constructor() {
        this.cpu = new Cpu.TopHatCpuIndicator();
        this.mem = new Mem.TopHatMemIndicator();
        this.net = new Net.TopHatNetIndicator();
        // TODO Add disk usage/activity indicator
    }

    addToPanel() {
        // Wait 500 ms to allow other indicators to queue up first
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            // TODO Make a top-level container that passes click signals to the appropriate indicator
            Main.panel.addToStatusArea(`${Me.metadata.name} Network Indicator`, this.net);
            Main.panel.addToStatusArea(`${Me.metadata.name} Memory Indicator`, this.mem);
            Main.panel.addToStatusArea(`${Me.metadata.name} CPU Indicator`, this.cpu);
        });
    }

    destroy() {
        this.cpu.destroy();
        this.mem.destroy();
        this.net.destroy();
    }
}

// Declare `tophat` in the scope of the whole script so it can
// be accessed in both `enable()` and `disable()`
let tophat = null;

function init() {
}

function enable() {
    log(`[${Me.metadata.name}] enabling version ${Me.metadata.version}`);

    tophat = new TopHat();
    tophat.addToPanel();

    log(`[${Me.metadata.name}] enabled`);
}

function disable() {
    log(`[${Me.metadata.name}] disabling version ${Me.metadata.version}`);

    if (tophat !== null) {
        tophat.destroy();
        tophat = null;
    }

    log(`[${Me.metadata.name}] disabled`);
}
