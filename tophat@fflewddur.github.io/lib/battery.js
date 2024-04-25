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

/* exported PowerMonitor */


import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import UPowerGlib from 'gi://UPowerGlib';

import { gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Config from './config.js';
import * as Shared from './shared.js';
import * as Monitor from './monitor.js';
import * as FileModule from './file.js';



class PowerUse {
    constructor(power = 0, battery = 0, status = 0, cycle_count = 0, time_left = 0, energy_full = 0, energy_full_design = 0) {
        this.power = power;
        this.battery = battery;
        this.status = status;
        this.cycle_count = cycle_count;
        this.time_left = time_left;
        this.energy_full = energy_full;
        this.energy_full_design = energy_full_design;

    }
}

export const PowerMonitor = GObject.registerClass({
    Properties: {
        'charging-color': GObject.ParamSpec.string(
            'charging-color',
            'Charging color',
            'Choose charging color',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'discharging-color': GObject.ParamSpec.string(
            'discharging-color',
            'Discharging color',
            'Choose discharging color',
            GObject.ParamFlags.READWRITE,
            ''
        ),
    },
}, class TopHatPowerMonitor extends Monitor.TopHatMonitor {
    _init(configHandler) {
        super._init(`TopHat Power Monitor`);
        this.batteryValues = new PowerUse()

        let gicon = Gio.icon_new_for_string(`${configHandler.metadata.path}/icons/bat-icon.svg`);
        this.icon = new St.Icon({ gicon, style_class: 'system-status-icon tophat-panel-icon' });
        this.add_child(this.icon);

        this.valuePower = new St.Label({
            text: '',
            style_class: 'tophat-panel-usage',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.valuePower);

        // Initialize upower
        const upowerClient = UPowerGlib.Client.new();
        const upowerDevices = upowerClient.get_devices();

        let batteryDevice = null;
        for (const dev of upowerDevices) {
            if (dev.is_rechargeable) {
                batteryDevice = dev;
                break;
            }
        }
        this.batteryDevice = batteryDevice;
        if (batteryDevice === null) {
            console.warn('TopHat did not found a rechargeable battery to monitor');
        } else {
            const path = batteryDevice.native_path;
            this.battery_path = `/sys/class/power_supply/${path}/uevent`;
        }
        this.history = new Array(0);
        this.refreshChartsTimer = 0;

        configHandler.settings.bind('show-bat', this, 'visible', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('show-icons', this.icon, 'visible', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('refresh-rate', this, 'refresh-rate', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('meter-fg-secondary-color', this, 'charging-color', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('meter-fg-color', this, 'discharging-color', Gio.SettingsBindFlags.DEFAULT);

        let id = this.connect('notify::visible', () => {
            if (this.visible) {
                this._startTimers();
            } else {
                this._stopTimers();
            }
        });
        this._signals.push(id);
        id = this.connect('notify::refresh-rate', () => {
            this._stopTimers();
            this._startTimers();
        });
        this._signals.push(id);

        this._buildMenu();
        this._startTimers();

    }

    _startTimers() {
        // Clear the history chart and configure it for the current refresh rate
        this.history = [];
        let updateInterval = this.computeSummaryUpdateInterval(Config.UPDATE_INTERVAL_NET);
        this.historyLimit = Config.HISTORY_MAX_SIZE * 1000 / updateInterval;

        if (this.refreshChartsTimer === 0) {
            this.refreshChartsTimer = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                updateInterval,
                () => this._refreshCharts()
            );
        }
    }

    _stopTimers() {
        if (this.refreshChartsTimer !== 0) {
            GLib.source_remove(this.refreshChartsTimer);
            this.refreshChartsTimer = 0;
        }
    }


    _buildMenu() {
        let label = new St.Label({ text: _('Battery usage'), style_class: 'menu-header' });
        this.addMenuRow(label, 0, 2, 1);

        label = new St.Label({ text: _('Power:'), style_class: 'menu-label' });
        this.addMenuRow(label, 0, 1, 1);
        this.menuPower = new St.Label({ text: '', style_class: 'menu-value' });
        this.addMenuRow(this.menuPower, 1, 1, 1);

        this.historyChart = new St.DrawingArea({ style_class: 'chart' });
        this.historyChart.connect('repaint', () => this._repaintHistory());
        this.addMenuRow(this.historyChart, 0, 2, 1);

        // FIXME: Don't hardcode this, base it on Config.HISTORY_MAX_SIZE

        let limitInMins = Config.HISTORY_MAX_SIZE / 60;
        let startLabel = ngettext('%d min ago', '%d mins ago', limitInMins).format(limitInMins);
        label = new St.Label({ text: startLabel, style_class: 'chart-label-then' });
        this.addMenuRow(label, 0, 1, 1);
        label = new St.Label({ text: _('now'), style_class: 'chart-label-now' });
        this.addMenuRow(label, 1, 1, 1);

        this.addMenuRow(new St.Label({ text: _('Remaining Time'), style_class: 'menu-cmd-name' }), 0, 1, 1);
        this.time_left = new St.Label({ text: '', style_class: 'menu-cmd-usage menu-section-end' });
        this.addMenuRow(this.time_left, 1, 1, 1);

        this.addMenuRow(new St.Label({ text: _('Cycle count'), style_class: 'menu-cmd-name' }), 0, 1, 1);
        this.cycle_count_n = new St.Label({ text: '', style_class: 'menu-cmd-usage menu-section-end' });
        this.addMenuRow(this.cycle_count_n, 1, 1, 1);

        this.addMenuRow(new St.Label({ text: _('Battery Capacity'), style_class: 'menu-cmd-name' }), 0, 1, 1);
        this.capacity = new St.Label({ text: '', style_class: 'menu-cmd-usage menu-section-end' });
        this.addMenuRow(this.capacity, 1, 1, 1);

        this.addMenuRow(new St.Label({ text: _('Energy (full)'), style_class: 'menu-cmd-name' }), 0, 1, 1);
        this.energy_full = new St.Label({ text: '', style_class: 'menu-cmd-usage menu-section-end' });
        this.addMenuRow(this.energy_full, 1, 1, 1);

        this.addMenuRow(new St.Label({ text: _('Energy (design)'), style_class: 'menu-cmd-name' }), 0, 1, 1);
        this.energy_full_design = new St.Label({ text: '', style_class: 'menu-cmd-usage menu-section-end' });
        this.addMenuRow(this.energy_full_design, 1, 1, 1);


        this.buildMenuButtons();
    }

    refresh() {
        this._getPowerValues();
        this._refreshCharts();
    }

    _refreshCharts() {
        this._getPowerValues()
        if (this.batteryDevice === null) {
            this.valuePower.text = 'N/A';
            this.menuPower.text = 'N/A';
            this.historyChart.queue_repaint();
            return false;
        }
        let power = this.batteryValues.power.toFixed(1);
        let status = this.batteryValues.status;

        while (this.history.length >= Config.HISTORY_MAX_SIZE) {
            this.history.shift();
        }
        this.history.push(this.batteryValues);
        let charging = '-';
        if (status === "Charging") {
            charging = '+';
        }

        this.valuePower.text = `${charging}${power}W`;
        this.menuPower.text = `${charging}${power}W`;

        this.historyChart.queue_repaint();
        this.cycle_count_n.text = `${this.batteryValues.cycle_count}`
        this.capacity.text = `${this.batteryValues.battery.toFixed(1)}%`
        this.time_left.text = `${Shared.formatTime(this.batteryValues.time_left / Shared.SECOND_AS_MICROSECONDS)}`
        this.energy_full.text = `${(this.batteryValues.energy_full / 1000000).toFixed(1)}Wh`
        this.energy_full_design.text = `${(this.batteryValues.energy_full_design / 1000000).toFixed(1)}Wh`
        return true;
    }

    _repaintHistory() {
        let [width, height] = this.historyChart.get_surface_size();
        let pointSpacing = width / (Config.HISTORY_MAX_SIZE - 1);
        let xStart = (Config.HISTORY_MAX_SIZE - this.history.length) * pointSpacing;
        let ctx = this.historyChart.get_context();
        var fgPowerCharging, fgPowerDischarging, bg;
        [, fgPowerCharging] = Clutter.Color.from_string(this.charging_color);
        [, fgPowerDischarging] = Clutter.Color.from_string(this.discharging_color);
        [, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

        // Use a small value to avoid max == 0
        let maxPower = 0.001;
        for (const powerUse of this.history) {
            if (powerUse.power > maxPower) {
                maxPower = powerUse.power;
            }
        }

        Shared.setSourceColor(ctx, bg);
        ctx.rectangle(0, 0, width, height);
        ctx.fill();

        Shared.setSourceColor(ctx, fgPowerDischarging);
        ctx.moveTo(xStart, height);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].power / maxPower * height);
            if (this.history[i].status === "Charging") {
                pointHeight = 0;
            }
            let x = xStart + pointSpacing * i;
            let y = height - pointHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
        ctx.closePath();
        ctx.fill();

        Shared.setSourceColor(ctx, fgPowerCharging);
        ctx.moveTo(xStart, height);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].power / maxPower * height);
            if (this.history[i].status !== "Charging") {
                pointHeight = 0;
            }
            let x = xStart + pointSpacing * i;
            let y = height - pointHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
        ctx.closePath();
        ctx.fill();

        ctx.$dispose();
    }

    _getPowerValues() {

        let output = {};
        new FileModule.File(this.battery_path).read().then(lines => {

            for (let line of lines.split('\n')) {
                let split = line.split('=');
                let k = split[0].replace('POWER_SUPPLY_', '')
                output[k] = split[1];
            }

            output['POWER_NOW'] = output['POWER_NOW'] / 1000000
            if ('VOLTAGE_NOW' in output && 'CURRENT_NOW' in output && (!('POWER_NOW' in output))) {
                output['POWER_NOW'] = (output['VOLTAGE_NOW'] * output['CURRENT_NOW']) / 1000000;
            }

            if ('CHARGE_FULL' in output && 'VOLTAGE_MIN_DESIGN' in output && (!('ENERGY_FULL' in output))) {
                output['ENERGY_FULL'] = (output['CHARGE_FULL'] * output['VOLTAGE_MIN_DESIGN']) / 1000000;
            }

            if ('CHARGE_FULL_DESIGN' in output && 'VOLTAGE_MIN_DESIGN' in output && (!('ENERGY_FULL_DESIGN' in output))) {
                output['ENERGY_FULL_DESIGN'] = (output['CHARGE_FULL_DESIGN'] * output['VOLTAGE_MIN_DESIGN']) / 1000000;
            }

            if ('VOLTAGE_MIN_DESIGN' in output && 'CHARGE_NOW' in output && (!('ENERGY_NOW' in output))) {
                output['ENERGY_NOW'] = (output['VOLTAGE_MIN_DESIGN'] * output['CHARGE_NOW']) / 1000000;
            }
            let timeLeft = 0;

            if ('ENERGY_FULL' in output && 'ENERGY_NOW' in output && 'POWER_NOW' in output && output['POWER_NOW'] > 0 && 'STATUS' in output && (output['STATUS'] == 'Charging' || output['STATUS'] == 'Discharging')) {


                // two different formulas depending on if we are charging or discharging
                if (output['STATUS'] == 'Charging') {
                    timeLeft = ((output['ENERGY_FULL'] - output['ENERGY_NOW']) / output['POWER_NOW']);
                } else {
                    timeLeft = (output['ENERGY_NOW'] / output['POWER_NOW']);
                }

                // don't process Infinity values
                if (timeLeft !== Infinity) {
                    if (this._battery_charge_status != output['STATUS']) {
                        // clears history due to state change
                        this._battery_time_left_history = [];

                        // clear time left history when laptop goes in and out of charging
                        this._battery_charge_status = output['STATUS'];
                    }

                    // add latest time left estimate to our history
                    this._battery_time_left_history.push(parseInt(timeLeft * 3600));

                    // keep track of last 15 time left estimates by erasing the first
                    if (this._battery_time_left_history.length > 10)
                        this._battery_time_left_history.shift();

                    // sum up and create average of our time left history
                    let sum = this._battery_time_left_history.reduce((a, b) => a + b);
                    let avg = sum / this._battery_time_left_history.length;

                    // use time left history to update screen
                    timeLeft = parseInt(avg)
                }
            }

            this.batteryValues = new PowerUse(
                output['POWER_NOW'],
                output['ENERGY_FULL'] / output['ENERGY_FULL_DESIGN'] * 100,
                output['STATUS'],
                output['CYCLE_COUNT'],
                timeLeft,
                output['ENERGY_FULL'],
                output['ENERGY_FULL_DESIGN'],
            )
        }).catch(err => {
            console.error(`TopHat battery：${err}`);
        });

    }


    destroy() {
        this._stopTimers();
        Gio.Settings.unbind(this, 'visible');
        Gio.Settings.unbind(this, 'refresh-rate');
        Gio.Settings.unbind(this.icon, 'visible');
        Gio.Settings.unbind(this, 'meter-fg-color');
        Gio.Settings.unbind(this, 'meter-fg-secondary-color');
        super.destroy();
    }
});
