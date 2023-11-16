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

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GTop from 'gi://GTop';
import St from 'gi://St';

import {gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Config from './config.js';
import * as Shared from './shared.js';
import * as Monitor from './monitor.js';

class NetUse {
    constructor(up = 0, down = 0) {
        this.up = up;
        this.down = down;
    }
}

export var NetMonitor = GObject.registerClass({
    Properties: {
        'network-unit': GObject.ParamSpec.string(
            'network-unit',
            'Network unit',
            'Display network activity in bits or bytes',
            GObject.ParamFlags.READWRITE,
            ''
        ),
    },
}, class TopHatNetMonitor extends Monitor.TopHatMonitor {
    _init(configHandler) {
        super._init('TopHat Network Monitor');

        let gicon = Gio.icon_new_for_string(`${configHandler.metadata.path}/icons/net-icon-symbolic.svg`);
        this.icon = new St.Icon({gicon, style_class: 'system-status-icon tophat-panel-icon tophat-panel-icon-net'});
        this.add_child(this.icon);

        let vbox = new St.BoxLayout({vertical: true});
        vbox.connect('notify::vertical', obj => {
            obj.vertical = true;
        });
        this.add_child(vbox);

        let padding = new St.Widget({y_expand: true});
        vbox.add_child(padding);
        let valueNetUp = new St.Label({text: '0', style_class: 'tophat-meter-value-net'});
        vbox.add_child(valueNetUp);
        this.valueNetUp = valueNetUp;
        let valueNetDown = new St.Label({text: '0', style_class: 'tophat-meter-value-net'});
        vbox.add_child(valueNetDown);
        this.valueNetDown = valueNetDown;
        padding = new St.Widget({y_expand: true});
        vbox.add_child(padding);

        // Initialize libgtop values
        this.net = new GTop.glibtop_netload();
        let bytesIn = 0;
        let bytesOut = 0;
        const netlist = new GTop.glibtop_netlist();
        const netDevices = GTop.glibtop_get_netlist(netlist);
        for (let i = 0; i < netlist.number; i++) {
            const dev = netDevices[i];
            // Skip loopback interface
            if (dev === 'lo') {
                continue;
            }
            // console.debug(`[TopHat] Found network device '${dev}'`);
            GTop.glibtop_get_netload(this.net, dev);
            bytesIn += this.net.bytes_in;
            bytesOut += this.net.bytes_out;
        }
        this.timePrev = GLib.get_monotonic_time();
        this.netPrev = {
            bytes_in: bytesIn,
            bytes_out: bytesOut,
        };
        this.history = new Array(0);
        this.refreshChartsTimer = 0;

        configHandler.settings.bind('show-net', this, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('refresh-rate', this, 'refresh-rate', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('show-icons', this.icon, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('meter-fg-color', this, 'meter-fg-color', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('network-usage-unit', this, 'network-unit', Gio.SettingsBindFlags.GET);

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
        let label = new St.Label({text: _('Network activity'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 2, 1);

        label = new St.Label({text: _('Sending:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 1, 1);
        this.menuNetUp = new St.Label({text: '', style_class: 'menu-value'});
        this.addMenuRow(this.menuNetUp, 1, 1, 1);

        label = new St.Label({text: _('Receiving:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 1, 1);
        this.menuNetDown = new St.Label({text: '', style_class: 'menu-value menu-section-end'});
        this.addMenuRow(this.menuNetDown, 1, 1, 1);

        // Create a grid layout for the history chart
        let grid = new St.Widget({
            layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        });
        this.historyGrid = grid.layout_manager;
        this.addMenuRow(grid, 0, 3, 1);

        this.historyChart = new St.DrawingArea({style_class: 'chart', x_expand: true});
        this.historyChart.connect('repaint', () => this._repaintHistory());
        this.historyGrid.attach(this.historyChart, 0, 0, 2, 3);

        label = new St.Label({text: _('Send'), y_align: Clutter.ActorAlign.START, style_class: 'chart-label'});
        this.historyGrid.attach(label, 2, 0, 1, 1);
        label = new St.Label({text: '100%', y_align: Clutter.ActorAlign.CENTER, style_class: 'chart-label'});
        this.historyGrid.attach(label, 2, 1, 1, 1);
        this.historyMaxVal = label;
        label = new St.Label({text: _('Recv'), y_align: Clutter.ActorAlign.END, style_class: 'chart-label'});
        this.historyGrid.attach(label, 2, 2, 1, 1);

        let limitInMins = Config.HISTORY_MAX_SIZE / 60;
        let startLabel = ngettext('%d min ago', '%d mins ago', limitInMins).format(limitInMins);
        label = new St.Label({text: startLabel, style_class: 'chart-label-then'});
        this.historyGrid.attach(label, 0, 3, 1, 1);
        label = new St.Label({text: _('now'), style_class: 'chart-label-now'});
        this.historyGrid.attach(label, 1, 3, 1, 1);

        this.buildMenuButtons();
    }

    refresh() {
        this._refreshCharts();
    }

    _refreshCharts() {
        let bytesIn = 0;
        let bytesOut = 0;
        let time = GLib.get_monotonic_time();
        const netlist = new GTop.glibtop_netlist();
        const netDevices = GTop.glibtop_get_netlist(netlist);
        for (let i = 0; i < netlist.number; i++) {
            const dev = netDevices[i];
            if (dev === 'lo' || dev.startsWith('vnet') || dev.startsWith('virbr')) {
                // Ignore loopback and virtual devices
                continue;
            }
            // console.debug(`[TopHat] Found network device '${dev}'`);
            GTop.glibtop_get_netload(this.net, dev);
            bytesIn += this.net.bytes_in;
            bytesOut += this.net.bytes_out;
        }
        let bytesInDelta = bytesIn - this.netPrev.bytes_in;
        let bytesOutDelta = bytesOut - this.netPrev.bytes_out;
        let timeDelta = (time - this.timePrev) / Shared.SECOND_AS_MICROSECONDS;
        this.timePrev = time;
        this.netPrev.bytes_in = bytesIn;
        this.netPrev.bytes_out = bytesOut;
        let netIn = Shared.bytesToHumanString(Math.round(bytesInDelta / timeDelta), this.network_unit);
        let netOut = Shared.bytesToHumanString(Math.round(bytesOutDelta / timeDelta), this.network_unit);
        this.valueNetDown.text = `${netIn}/s`;
        this.valueNetUp.text = `${netOut}/s`;
        this.menuNetDown.text = `${netIn}/s`;
        this.menuNetUp.text = `${netOut}/s`;
        // console.debug(`[TopHat] Net: bytes_in=${(bytesInDelta / timeDelta).toFixed(2)}/s bytes_out=${(bytesOutDelta / timeDelta).toFixed(2)}/s time=${timeDelta}`);

        while (this.history.length >= this.historyLimit) {
            this.history.shift();
        }
        this.history.push(new NetUse(
            Math.round(bytesOutDelta / timeDelta),
            Math.round(bytesInDelta / timeDelta)));

        this.historyChart.queue_repaint();
        return true;
    }

    _repaintHistory() {
        let [width, height] = this.historyChart.get_surface_size();
        let pointSpacing = width / (this.historyLimit - 1);
        let xStart = (this.historyLimit - this.history.length) * pointSpacing;
        let ctx = this.historyChart.get_context();
        var fgDown, fgUp, bg, gc;
        [, fgDown] = Clutter.Color.from_string(this.meter_fg_color);
        [, fgUp] = Clutter.Color.from_string(this.meter_fg_color);
        [, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);
        [, gc] = Clutter.Color.from_string(Config.METER_GRID_COLOR);

        // Use a small value to avoid max == 0
        let max = 0.001;
        for (const netUse of this.history) {
            if (netUse.down > max) {
                max = netUse.down;
            }
            if (netUse.up > max) {
                max = netUse.up;
            }
        }
        max = Shared.roundMax(max);
        this.historyMaxVal.text = `${Shared.bytesToHumanString(max, 'bytes', true)}/s`;
        max *= 2; // leave room for both upload and download speeds on the same chart

        Clutter.cairo_set_source_color(ctx, bg);
        ctx.rectangle(0, 0, width, height);
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, gc);
        ctx.rectangle(0, height / 2, width, 1);
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fgDown);
        ctx.moveTo(xStart, height);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].down / max * height);
            let x = xStart + pointSpacing * i;
            let y = height - pointHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
        ctx.closePath();
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fgUp);
        ctx.moveTo(xStart, 0);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].up / max * height);
            let x = xStart + pointSpacing * i;
            let y = pointHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, 0);
        ctx.closePath();
        ctx.fill();

        ctx.$dispose();
    }

    destroy() {
        this._stopTimers();
        Gio.Settings.unbind(this, 'visible');
        Gio.Settings.unbind(this, 'refresh-rate');
        Gio.Settings.unbind(this.icon, 'visible');
        Gio.Settings.unbind(this, 'meter-fg-color');
        Gio.Settings.unbind(this, 'network-unit');
        super.destroy();
    }
});
