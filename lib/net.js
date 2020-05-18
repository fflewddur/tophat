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

            let label = new St.Label({ text: 'Download:', style_class: 'menu-label' });
            lm.attach(label, 0, 0, 1, 1);
            this.menuNetDown = new St.Label({ text: '', style_class: 'menu-value' });
            lm.attach(this.menuNetDown, 1, 0, 1, 1);

            label = new St.Label({ text: 'Upload:', style_class: 'menu-label' });
            lm.attach(label, 0, 1, 1, 1);
            this.menuNetUp = new St.Label({ text: '', style_class: 'menu-value' });
            lm.attach(this.menuNetUp, 1, 1, 1, 1);

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

            return true;
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
