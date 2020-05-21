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
var TopHatMemIndicator = GObject.registerClass(
    class TopHatMemIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, `${Me.metadata.name} Memory Indicator`, false);

            let hbox = new St.BoxLayout();
            this.add_child(hbox);

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/mem.svg`);
            let icon = new St.Icon({ gicon, icon_size: 24 });
            hbox.add_child(icon);

            this._buildMeter(hbox);
            this._buildMenu();

            // Initialize libgtop values
            this.mem = new GTop.glibtop_mem();
            this.memUsage = 0;
            this.history = new Array(0);

            this.refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_MEM, () => this.refresh());
        }

        _buildMeter(parent) {
            this.meter = new St.DrawingArea({ style_class: 'meter' });
            parent.add_child(this.meter);
            this.meter.connect('repaint', () => this.repaintMeter());
        }

        _buildMenu() {
            let statusMenu = new PopupMenu.PopupMenuSection();
            let grid = new St.Widget({
                style_class: 'menu-grid',
                layout_manager: new Clutter.GridLayout({ orientation: Clutter.Orientation.VERTICAL }),
            });
            let lm = grid.layout_manager;
            statusMenu.box.add_child(grid);

            let label = new St.Label({ text: 'Memory usage:', style_class: 'menu-label' });
            lm.attach(label, 0, 0, 1, 1);
            this.menuMemUsage = new St.Label({ text: '0%', style_class: 'menu-value' });
            lm.attach(this.menuMemUsage, 1, 0, 1, 1);

            this.historyChart = new St.DrawingArea({ style_class: 'chart' });
            this.historyChart.connect('repaint', () => this.repaintHistory());
            lm.attach(this.historyChart, 0, 1, 2, 1);

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
            GTop.glibtop_get_mem(this.mem);
            let memTotal = this.mem.total / 1024 / 1024;
            let memUsed = this.mem.user / 1024 / 1024;
            this.memUsage = Math.round(memUsed / memTotal * 100);
            // log(`[TopHat] Memory: ${this.memUsage}% of ${Math.round(memTotal)} MB`);
            // this.valueRAM.text = `${this.memUsage}%`;
            this.menuMemUsage.text = `${this.memUsage}%`;

            while (this.history.length >= Config.HISTORY_MAX_SIZE)
                this.history.shift();
            this.history.push(this.memUsage);

            this.meter.queue_repaint();
            this.historyChart.queue_repaint();

            return true;
        }

        repaintMeter() {
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

        repaintHistory() {
            let [width, height] = this.historyChart.get_surface_size();
            let pointSpacing = width / (Config.HISTORY_MAX_SIZE - 1);
            let xStart = (Config.HISTORY_MAX_SIZE - this.history.length) * pointSpacing;
            let ctx = this.historyChart.get_context();
            var _, fg, bg;
            [_, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [_, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            Clutter.cairo_set_source_color(ctx, fg);
            ctx.moveTo(xStart, height);
            for (let i = 0; i < this.history.length; i++) {
                let pointHeight = Math.ceil(this.history[i] / 100.0 * height);
                let x = xStart + pointSpacing * i;
                let y = height - pointHeight;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
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
