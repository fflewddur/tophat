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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const UPowerGlib = imports.gi.UPowerGlib;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const Monitor = Me.imports.lib.monitor;
const _ = Config.Domain.gettext;



class PowerUse {
    constructor(power = 0, battery = 0, state = 0) {
        this.power = power;
        this.battery = battery;
        this.state = state;

        // UNKNOWN = 0
        // CHARGING = 1
        // DISCHARGING = 2
        // EMPTY = 3
        // FULLY_CHARGED = 4
        // PENDING_CHARGE = 5
        // PENDING_DISCHARGE = 6
        // LAST = 7
    }
}

var PowerMonitor = GObject.registerClass({
    Properties: {
        'battery-color': GObject.ParamSpec.string(
            'battery-color',
            'Battery color',
            'Choose battery line color',
            GObject.ParamFlags.READWRITE,
            ''
        ),
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
        super._init(`${Me.metadata.name} Power Monitor`);

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/bat-icon.svg`);
        let icon = new St.Icon({gicon, style_class: 'system-status-icon tophat-panel-icon tophat-panel-icon-net'});
        this.add_child(icon);

        let vbox = new St.BoxLayout({vertical: true});
        vbox.connect('notify::vertical', obj => {
            obj.vertical = true;
        });
        this.add_child(vbox);

        let padding = new St.Widget({y_expand: true});
        vbox.add_child(padding);
        let valuePower = new St.Label({text: '0', style_class: 'tophat-meter-value-power'});
        vbox.add_child(valuePower);
        this.valuePower = valuePower;
        let valueBattery = new St.Label({text: '0', style_class: 'tophat-meter-value-battery'});
        vbox.add_child(valueBattery);
        this.valueBattery = valueBattery;
        padding = new St.Widget({y_expand: true});
        vbox.add_child(padding);

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
            log('TopHat did not found a rechargeable battery to monitor');
        } else {
            const path = batteryDevice.native_path;
            const basePath = `/sys/class/power_supply/${path}`;
            this.currentPath = `${basePath}/current_now`;
            this.voltagePath = `${basePath}/voltage_now`;
            this.chargePath = `${basePath}/charge_now`;
            this.chargeFullPath = `${basePath}/charge_full`;
            this.statusPath = `${basePath}/status`;
        }
        this.history = new Array(0);
        this._buildMenu();

        this.refreshChartsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_NET, () => this.refreshCharts());
        configHandler.settings.bind('show-bat', this, 'visible', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('show-icons', icon, 'visible', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('meter-fg-color', this, 'meter-fg-color', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('meter-fg-battery-color', this, 'battery-color', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('meter-fg-charging-color', this, 'charging-color', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('meter-fg-discharging-color', this, 'discharging-color', Gio.SettingsBindFlags.DEFAULT);
    }

    _buildMenu() {
        let label = new St.Label({text: _('Power usage'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 2, 1);

        label = new St.Label({text: _('Power:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 1, 1);
        this.menuPower = new St.Label({text: '', style_class: 'menu-value'});
        this.addMenuRow(this.menuPower, 1, 1, 1);

        label = new St.Label({text: _('Battery:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 1, 1);
        this.menuBattery = new St.Label({text: '', style_class: 'menu-value'});
        this.addMenuRow(this.menuBattery, 1, 1, 1);

        this.historyChart = new St.DrawingArea({style_class: 'chart'});
        this.historyChart.connect('repaint', () => this.repaintHistory());
        this.addMenuRow(this.historyChart, 0, 2, 1);

        // FIXME: Don't hardcode this, base it on Config.HISTORY_MAX_SIZE
        label = new St.Label({text: _('2 mins ago'), style_class: 'chart-label-then'});
        this.addMenuRow(label, 0, 1, 1);
        label = new St.Label({text: _('now'), style_class: 'chart-label-now'});
        this.addMenuRow(label, 1, 1, 1);

        this.buildMenuButtons();
    }

    refreshCharts() {
        if (this.batteryDevice === null) {
            this.valuePower.text = 'N/A';
            this.menuPower.text = 'N/A';
            this.valueBattery.text = 'N/A';
            this.menuBattery.text = 'N/A';
            this.historyChart.queue_repaint();
            return false;
        }

        let batteryValues = this.getPowerValues();
        let power = Math.round(batteryValues.power);
        let battery = Math.round(batteryValues.battery);
        let state = batteryValues.state;
        while (this.history.length >= Config.HISTORY_MAX_SIZE) {
            this.history.shift();
        }
        this.history.push(batteryValues);
        let charging = '+';
        if (state === 2) {
            charging = '-';
        }

        this.valuePower.text = `${charging}${power}W`;
        this.menuPower.text = `${charging}${power}W`;
        this.valueBattery.text = `${battery}%`;
        this.menuBattery.text = `${battery}%`;
        this.historyChart.queue_repaint();
        return true;
    }

    repaintHistory() {
        let [width, height] = this.historyChart.get_surface_size();
        let pointSpacing = width / (Config.HISTORY_MAX_SIZE - 1);
        let xStart = (Config.HISTORY_MAX_SIZE - this.history.length) * pointSpacing;
        let ctx = this.historyChart.get_context();
        var fgPowerCharging, fgPowerDischarging, fgBat, bg;
        [, fgPowerCharging] = Clutter.Color.from_string(this.charging_color);
        [, fgPowerDischarging] = Clutter.Color.from_string(this.discharging_color);
        [, fgBat] = Clutter.Color.from_string(this.battery_color);
        [, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

        // Use a small value to avoid max == 0
        let maxPower = 0.001;
        for (const powerUse of this.history) {
            if (powerUse.power > maxPower) {
                maxPower = powerUse.power;
            }
        }

        Clutter.cairo_set_source_color(ctx, bg);
        ctx.rectangle(0, 0, width, height);
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fgPowerDischarging);
        ctx.moveTo(xStart, height);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].power / maxPower * height);
            if (this.history[i].state !== 2) {
                pointHeight = 0;
            }
            let x = xStart + pointSpacing * i;
            let y = height - pointHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
        ctx.closePath();
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fgPowerCharging);
        ctx.moveTo(xStart, height);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].power / maxPower * height);
            if (this.history[i].state === 2) {
                pointHeight = 0;
            }
            let x = xStart + pointSpacing * i;
            let y = height - pointHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
        ctx.closePath();
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fgBat);
        ctx.moveTo(xStart, height);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].battery / 100 * height);
            let x = xStart + pointSpacing * i;
            let y = height - pointHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
        ctx.stroke();
        ctx.$dispose();
    }

    getPowerValues() {
        const current = this.parseValue(this.currentPath) * 1e-6;
        const voltage = this.parseValue(this.voltagePath) * 1e-6;
        const charge = this.parseValue(this.chargePath);
        const chargeFull = Math.max(this.parseValue(this.chargeFullPath), 1); // avoid division by zero
        const status = this.parseStatus(this.statusPath).replace(/[\n\r]/g, '').toUpperCase();
        const state = UPowerGlib.DeviceState[status];


        return new PowerUse(
            voltage * current,
            charge / chargeFull * 100,
            state
        );
    }

    parseValue(path) {
        try {
            return parseFloat(
                new TextDecoder('utf-8').decode(
                    GLib.file_get_contents(path)[1]));
        } catch (err) {
            return 0;
        }
    }

    parseStatus(path) {
        try {
            return new TextDecoder('utf-8').decode(
                GLib.file_get_contents(path)[1]);
        } catch {
            return 'Unknown';
        }
    }

    destroy() {
        if (this.refreshChartsTimer !== 0) {
            GLib.source_remove(this.refreshChartsTimer);
            this.refreshChartsTimer = 0;
        }
        super.destroy();
    }
});
