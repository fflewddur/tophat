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
const PanelMenu = imports.ui.panelMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;

// eslint-disable-next-line no-unused-vars
var TopHatMemIndicator = GObject.registerClass(
    class TopHatMemIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, `${Me.metadata.name} Memory Indicator`, false);

            let hbox = new St.BoxLayout();
            this.add_child(hbox);

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/mem.svg`);
            let icon = new St.Icon({ gicon, icon_size: 24 });
            hbox.add_child(icon);

            this.meter = new St.DrawingArea({ style_class: 'meter' });
            hbox.add_child(this.meter);
            this.meter.connect('repaint', () => this.repaint());

            // let valueRAM = new St.Label({ text: '0%', style_class: 'value' });
            // hbox.add_child(valueRAM);
            // this.valueRAM = valueRAM;

            // Initialize libgtop values
            this.mem = new GTop.glibtop_mem();
            this.memUsage = 0;

            this.refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_MEM, () => this.refresh());

            // Menu
            hbox = new St.BoxLayout();
            let label = new St.Label({ text: 'Memory usage:', style_class: 'menu-label' });
            hbox.add_child(label);
            this.menuMemUsage = new St.Label({ text: '0', style_class: 'menu-value' });
            hbox.add_child(this.menuMemUsage);
            this.menu.box.add_child(hbox);
        }

        refresh() {
            GTop.glibtop_get_mem(this.mem);
            let memTotal = this.mem.total / 1024 / 1024;
            let memUsed = this.mem.user / 1024 / 1024;
            this.memUsage = Math.round(memUsed / memTotal * 100);
            // log(`[TopHat] Memory: ${this.memUsage}% of ${Math.round(memTotal)} MB`);
            // this.valueRAM.text = `${this.memUsage}%`;
            this.menuMemUsage.text = `${this.memUsage}%`;
            this.meter.queue_repaint();

            return true;
        }

        repaint() {
            let [width, height] = this.meter.get_surface_size();
            let ctx = this.meter.get_context();
            var _, fg, bg;
            [_, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [_, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            Clutter.cairo_set_source_color(ctx, fg);
            let fillHeight = Math.ceil(this.memUsage / 100.0 * height);
            ctx.rectangle(0, height - fillHeight, width, height);
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
