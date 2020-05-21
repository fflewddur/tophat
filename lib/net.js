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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const GTop = imports.gi.GTop;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Shell = imports.gi.Shell;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;

class NetUse {
    constructor(up = 0, down = 0) {
        this.up = up;
        this.down = down;
    }
}

// eslint-disable-next-line no-unused-vars
var TopHatNetIndicator = GObject.registerClass(
    class TopHatNetIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, `${Me.metadata.name} Network Indicator`, false);

            let hbox = new St.BoxLayout();
            this.add_child(hbox);

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/net.svg`);
            let icon = new St.Icon({ gicon, icon_size: 24 });
            hbox.add_child(icon);

            let vbox = new St.BoxLayout({ vertical: true });
            hbox.add_child(vbox);

            let valueNetUp = new St.Label({ text: '0', style_class: 'value-net' });
            vbox.add_child(valueNetUp);
            this.valueNetUp = valueNetUp;

            let valueNetDown = new St.Label({ text: '0', style_class: 'value-net' });
            vbox.add_child(valueNetDown);
            this.valueNetDown = valueNetDown;

            // Initialize libgtop values
            this.net = new GTop.glibtop_netload();
            let bytesIn = 0;
            let bytesOut = 0;
            let netlist = new GTop.glibtop_netlist();
            this.netDevices = GTop.glibtop_get_netlist(netlist);
            for (const dev of this.netDevices) {
                // Skip loopback interface
                if (dev === 'lo')
                    continue;
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

            this.refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_NET, () => this.refresh());
        }

        _buildMenu() {
            let statusMenu = new PopupMenu.PopupMenuSection();
            let grid = new St.Widget({
                style_class: 'menu-grid',
                layout_manager: new Clutter.GridLayout({ orientation: Clutter.Orientation.VERTICAL }),
            });
            let lm = grid.layout_manager;
            statusMenu.box.add_child(grid);
            let row = 0;

            let label = new St.Label({ text: 'Sending:', style_class: 'menu-label' });
            lm.attach(label, 0, row, 1, 1);
            this.menuNetUp = new St.Label({ text: '', style_class: 'menu-value' });
            lm.attach(this.menuNetUp, 1, row, 1, 1);
            row++;

            label = new St.Label({ text: 'Receiving:', style_class: 'menu-label' });
            lm.attach(label, 0, row, 1, 1);
            this.menuNetDown = new St.Label({ text: '', style_class: 'menu-value' });
            lm.attach(this.menuNetDown, 1, row, 1, 1);
            row++;

            this.historyChart = new St.DrawingArea({ style_class: 'chart' });
            this.historyChart.connect('repaint', () => this.repaintHistory());
            lm.attach(this.historyChart, 0, 2, 2, 1);

            this.menu.addMenuItem(statusMenu);

            let appSys = Shell.AppSystem.get_default();
            let app = appSys.lookup_app('gnome-system-monitor.desktop');
            let menuItem = new PopupMenu.PopupImageMenuItem('System Monitor', 'utilities-system-monitor-symbolic');
            menuItem.connect('activate', () => {
                this.menu.close(true);
                app.activate();
            });
            this.menu.addMenuItem(menuItem);
        }

        refresh() {
            let bytesIn = 0;
            let bytesOut = 0;
            let time = GLib.get_monotonic_time();
            for (const dev of this.netDevices) {
                if (dev === 'lo')
                    continue;
                // log(`[TopHat] Found network device '${dev}'`);
                GTop.glibtop_get_netload(this.net, dev);
                bytesIn += this.net.bytes_in;
                bytesOut += this.net.bytes_out;
            }
            let bytesInDelta = bytesIn - this.netPrev.bytes_in;
            let bytesOutDelta = bytesOut - this.netPrev.bytes_out;
            let timeDelta = (time - this.timePrev) / Config.SECOND_AS_MICROSECONDS;
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

            while (this.history.length >= Config.HISTORY_MAX_SIZE)
                this.history.shift();
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
            var _, fgDown, fgUp, bg;
            [_, fgDown] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [_, fgUp] = Clutter.Color.from_string(Config.METER_FG2_COLOR);
            [_, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            let max = 0;
            for (const netUse of this.history) {
                if (netUse.down > max)
                    max = netUse.down;
                if (netUse.up > max)
                    max = netUse.up;
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
            if (this.refreshTimer !== 0) {
                GLib.source_remove(this.refreshTimer);
                this.refreshTimer = 0;
            }
            super.destroy();
        }
    });

// Convert a number of bytes to a more logical human-readable string
// (e.g., 1024 -> 1 K)
function bytesToHumanString(bytes) {
    if (bytes < 1)
        return '0 K';
    else if (bytes < 1024)
        // Indicate network activity, but don't clutter the UI w/ # of bytes
        return '1 K';
    else if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(0)} K`;
    else
        return `${(bytes / 1024 / 1024).toFixed(1)} M`;
}
