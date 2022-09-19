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

/* exported NetMonitor */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const GTop = imports.gi.GTop;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Shell = imports.gi.Shell;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const Shared = Me.imports.lib.shared;
const Monitor = Me.imports.lib.monitor;
const _ = Config.Domain.gettext;

class NetUse {
    constructor(up = 0, down = 0) {
        this.up = up;
        this.down = down;
    }
}

var NetMonitor = GObject.registerClass(
    class TopHatNetMonitor extends Monitor.TopHatMonitor {
        _init(settings) {
            super._init(`${Me.metadata.name} Network Monitor`);

            let hbox = new St.BoxLayout({style_class: 'net'});
            this.add_child(hbox);

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/net-icon.svg`);
            let icon = new St.Icon({gicon, icon_size: 12, style_class: 'icon'});
            hbox.add_child(icon);

            let vbox = new St.BoxLayout({vertical: true});
            vbox.connect('notify::vertical', obj => {
                obj.vertical = true;
            });
            hbox.add_child(vbox);

            let padding = new St.Widget({y_expand: true});
            vbox.add_child(padding);
            let valueNetUp = new St.Label({text: '0', style_class: 'value-net'});
            vbox.add_child(valueNetUp);
            this.valueNetUp = valueNetUp;
            let valueNetDown = new St.Label({text: '0', style_class: 'value-net'});
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
            for (const dev of netDevices) {
                // Skip loopback interface
                if (dev === 'lo') {
                    continue;
                }
                // log(`[TopHat] Found network device '${dev}'`);
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

            this._buildMenu();

            this.refreshChartsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_NET, () => this.refreshCharts());

            settings.bind('show-net', this, 'visible', Gio.SettingsBindFlags.DEFAULT);
            settings.bind('show-icons', icon, 'visible', Gio.SettingsBindFlags.DEFAULT);
        }

        _buildMenu() {
            let statusMenu = new PopupMenu.PopupMenuSection();
            let grid = new St.Widget({
                style_class: 'menu-grid',
                layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
            });
            let lm = grid.layout_manager;
            statusMenu.box.add_child(grid);

            let row = 0;
            let label = new St.Label({text: _('Network usage'), style_class: 'menu-header'});
            lm.attach(label, 0, row, 2, 1);
            row++;

            label = new St.Label({text: _('Sending:'), style_class: 'menu-label'});
            lm.attach(label, 0, row, 1, 1);
            this.menuNetUp = new St.Label({text: '', style_class: 'menu-value'});
            lm.attach(this.menuNetUp, 1, row, 1, 1);
            row++;

            label = new St.Label({text: _('Receiving:'), style_class: 'menu-label'});
            lm.attach(label, 0, row, 1, 1);
            this.menuNetDown = new St.Label({text: '', style_class: 'menu-value'});
            lm.attach(this.menuNetDown, 1, row, 1, 1);
            row++;

            this.historyChart = new St.DrawingArea({style_class: 'chart'});
            this.historyChart.connect('repaint', () => this.repaintHistory());
            lm.attach(this.historyChart, 0, row, 2, 1);
            row++;

            // FIXME: Don't hardcode this, base it on Config.HISTORY_MAX_SIZE
            label = new St.Label({text: _('2 mins ago'), style_class: 'chart-label-then'});
            lm.attach(label, 0, row, 1, 1);
            label = new St.Label({text: _('now'), style_class: 'chart-label-now'});
            lm.attach(label, 1, row, 1, 1);
            row++;

            // label = new St.Label({ text: 'Top processes', style_class: 'menu-header' });
            // lm.attach(label, 0, row, 2, 1);
            // row++;

            this.menu.addMenuItem(statusMenu);

            let appSys = Shell.AppSystem.get_default();
            let app = appSys.lookup_app('gnome-system-monitor.desktop');
            let menuItem = new PopupMenu.PopupImageMenuItem(_('System Monitor'), 'org.gnome.SystemMonitor-symbolic');
            menuItem.connect('activate', () => {
                this.menu.close(true);
                app.activate();
            });
            menuItem.connect('leave-event', widget => {
                widget.set_hover(false);
                widget.remove_style_pseudo_class('focus');
            });
            this.menu.addMenuItem(menuItem);
        }

        refreshCharts() {
            let bytesIn = 0;
            let bytesOut = 0;
            let time = GLib.get_monotonic_time();
            const netlist = new GTop.glibtop_netlist();
            const netDevices = GTop.glibtop_get_netlist(netlist);
            for (const dev of netDevices) {
                if (dev === 'lo') {
                    continue;
                }
                // log(`[TopHat] Found network device '${dev}'`);
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
            let netIn = bytesToHumanString(Math.round(bytesInDelta / timeDelta));
            let netOut = bytesToHumanString(Math.round(bytesOutDelta / timeDelta));
            this.valueNetDown.text = `${netIn}/s`;
            this.valueNetUp.text = `${netOut}/s`;
            this.menuNetDown.text = `${netIn}/s`;
            this.menuNetUp.text = `${netOut}/s`;
            // log(`[TopHat] Net: bytes_in=${(bytesInDelta / timeDelta).toFixed(2)}/s bytes_out=${(bytesOutDelta / timeDelta).toFixed(2)}/s time=${timeDelta}`);

            while (this.history.length >= Config.HISTORY_MAX_SIZE) {
                this.history.shift();
            }
            this.history.push(new NetUse(
                Math.round(bytesOutDelta / timeDelta),
                Math.round(bytesInDelta / timeDelta)));

            this.historyChart.queue_repaint();
            return true;
        }

        repaintHistory() {
            let [width, height] = this.historyChart.get_surface_size();
            let pointSpacing = width / (Config.HISTORY_MAX_SIZE - 1);
            let xStart = (Config.HISTORY_MAX_SIZE - this.history.length) * pointSpacing;
            let ctx = this.historyChart.get_context();
            var unused, fgDown, fgUp, bg;
            [unused, fgDown] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [unused, fgUp] = Clutter.Color.from_string(Config.METER_FG2_COLOR);
            [unused, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            let max = 0;
            for (const netUse of this.history) {
                if (netUse.down > max) {
                    max = netUse.down;
                }
                if (netUse.up > max) {
                    max = netUse.up;
                }
            }
            max *= 2; // leave room for both upload and download speeds on the same chart

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
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
            if (this.refreshChartsTimer !== 0) {
                GLib.source_remove(this.refreshChartsTimer);
                this.refreshChartsTimer = 0;
            }
            super.destroy();
        }
    });

const ONE_MB_IN_B = 1048576;
const ONE_HUNDRED_MB_IN_B = 104857600;
const ONE_GB_IN_B = 1073741824;

// Convert a number of bytes to a more logical human-readable string
// (e.g., 1024 -> 1 K)
function bytesToHumanString(bytes) {
    if (bytes < 1) {
        return '0 K';
    } else if (bytes < 1024) {
        // Indicate network activity, but don't clutter the UI w/ # of bytes
        return '1 K';
    } else if (bytes < ONE_MB_IN_B) {
        return `${(bytes / 1024).toFixed(0)} K`;
    } else if (bytes < ONE_HUNDRED_MB_IN_B) { // Show one decimal of precision for < 100 MB
        return `${(bytes / ONE_MB_IN_B).toFixed(1)} M`;
    } else if (bytes < ONE_GB_IN_B) {
        return `${(bytes / ONE_MB_IN_B).toFixed(0)} M`;
    } else {
        return `${(bytes / ONE_GB_IN_B).toFixed(1)} G`;
    }
}
