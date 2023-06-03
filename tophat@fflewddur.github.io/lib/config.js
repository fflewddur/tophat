/* eslint-disable no-unused-vars */
'use strict';

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

// Time between resource updates, in milliseconds
var UPDATE_INTERVAL_CPU = 2000;
var UPDATE_INTERVAL_MEM = 2000;
var UPDATE_INTERVAL_NET = 2000;
var UPDATE_INTERVAL_DISK = 5000;
var UPDATE_INTERVAL_PROCLIST = 5000;

var METER_BG_COLOR = '#00000033';
var METER_GRID_COLOR = '#77777766';

var HISTORY_MAX_SIZE = 300; // The time-series graphs will show data for this many seconds

var N_TOP_PROCESSES = 6;

const Gettext = imports.gettext;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var Domain = Gettext.domain(Me.metadata.uuid);

var ConfigHandler = class ConfigHandler {
    constructor() {
        this.signal_ids = [];
        this._settings = ExtensionUtils.getSettings();
        this._partitions = null;
    }

    setPartitions(parts) {
        this._partitions = parts;
    }

    connect_void(setting, func) {
        let id = this._settings.connect(`changed::${setting}`, () => {
            func();
        });
        this.signal_ids.push(id);
    }

    get settings() {
        return this._settings;
    }

    get positionInPanel() {
        return this._settings.get_enum('position-in-panel');
    }

    set positionInPanel(value) {
        // log(`set positionInPanel to ${value}`);
        this._settings.set_enum('position-in-panel', value);
    }

    get cpuDisplay() {
        return this._settings.get_enum('cpu-display');
    }

    set cpuDisplay(value) {
        this._settings.set_enum('cpu-display', value);
    }

    get memDisplay() {
        return this._settings.get_enum('mem-display');
    }

    set memDisplay(value) {
        this._settings.set_enum('mem-display', value);
    }

    get diskDisplay() {
        return this._settings.get_enum('disk-display');
    }

    set diskDisplay(value) {
        this._settings.set_enum('disk-display', value);
    }

    get refreshRate() {
        return this._settings.get_enum('refresh-rate');
    }

    set refreshRate(value) {
        this._settings.set_enum('refresh-rate', value);
    }

    get meterFGColor() {
        return this._settings.get_string('meter-fg-color');
    }

    set meterFGColor(value) {
        this._settings.set_string('meter-fg-color', value);
    }

    get meterBarWidth() {
        return this._settings.get_int('meter-bar-width');
    }

    set meterBarWidth(value) {
        this._settings.set_int('meter-bar-width', value);
    }

    get cpuShowCores() {
        return this._settings.get_boolean('cpu-show-cores');
    }

    set cpuShowCores(value) {
        this._settings.set_boolean('cpu-show-cores', value);
    }

    get networkUnit() {
        return this._settings.get_enum('network-usage-unit');
    }

    set networkUnit(value) {
        this._settings.set_enum('network-usage-unit', value);
    }

    get mountToMonitor() {
        // Convert from a string to an index
        let index = 0;
        if (this._partitions) {
            let m = this._settings.get_string('mount-to-monitor');
            if (typeof this._partitions.get_string === 'function') {
                for (let i = 0; i < this._partitions.get_n_items(); i++) {
                    if (m === this._partitions.get_string(i)) {
                        index = i;
                        break;
                    }
                }
            } else {
                // We're using an array w/ GTK3
                for (let i = 0; i < this._partitions.length; i++) {
                    if (m === this._partitions[i]) {
                        index = i;
                        break;
                    }
                }
            }
        }
        return index;
    }

    set mountToMonitor(value) {
        // Convert from an index to a string
        if (this._partitions) {
            if (typeof this._partitions.get_string === 'function') {
                value = this._partitions.get_string(value);
            } else {
                // We're using an array w/ GTK3
                value = this._partitions[value];
            }
            this._settings.set_string('mount-to-monitor', value);
        }
    }

    get diskMonitorMode() {
        return this._settings.get_enum('disk-monitor-mode');
    }

    set diskMonitorMode(value) {
        this._settings.set_enum('disk-monitor-mode', value);
    }

    destroy() {
        this.signal_ids.forEach(id => {
            this._settings.disconnect(id);
        });
    }
};
