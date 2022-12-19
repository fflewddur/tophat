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
var UPDATE_INTERVAL_PROCLIST = 5000;

var METER_BG_COLOR = '#00000033';

var HISTORY_MAX_SIZE = 120;

var N_TOP_PROCESSES = 6;

const Gettext = imports.gettext;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var Domain = Gettext.domain(Me.metadata.uuid);

var ConfigHandler = class ConfigHandler {
    constructor() {
        this.signal_ids = [];
        this._settings = ExtensionUtils.getSettings();
    }

    connect_boolean(setting, monitor, property) {
        let id = this._settings.connect(`changed::${setting}`, () => {
            monitor[property] = this._settings.get_boolean(setting);
        });
        monitor[property] = this._settings.get_boolean(setting);
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

    get meterFGColor() {
        return this._settings.get_string('meter-fg-color');
    }

    set meterFGColor(value) {
        this._settings.set_string('meter-fg-color', value);
    }

    get meterFGSecondayColor() {
        return this._settings.get_string('meter-fg-secondary-color');
    }

    set meterFGSecondayColor(value) {
        this._settings.set_string('meter-fg-secondary-color', value);
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

    destroy() {
        this.signal_ids.forEach(id => {
            this._settings.disconnect(id);
        });
    }
};
