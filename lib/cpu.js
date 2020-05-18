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
var TopHatCpuIndicator = GObject.registerClass(
    class TopHatCpuIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, `${Me.metadata.name} CPU Indicator`, false);

            let hbox = new St.BoxLayout();
            this.add_child(hbox);

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/cpu.svg`);
            let icon = new St.Icon({ gicon, icon_size: 24 });
            hbox.add_child(icon);

            // Initialize libgtop values
            this.cpuCores = GTop.glibtop_get_sysinfo().ncpu;
            this.cpu = new GTop.glibtop_cpu();
            GTop.glibtop_get_cpu(this.cpu);
            this.cpuPrev = {
                user: this.cpu.user,
                sys: this.cpu.sys,
                nice: this.cpu.nice,
                total: this.cpu.total,
                xcpu_user: new Array(this.cpuCores),
                xcpu_sys: new Array(this.cpuCores),
                xcpu_nice: new Array(this.cpuCores),
                xcpu_total: new Array(this.cpuCores),
            };
            for (let i = 0; i < this.cpuCores; i++) {
                this.cpuPrev.xcpu_user[i] = this.cpu.xcpu_user[i];
                this.cpuPrev.xcpu_sys[i] = this.cpu.xcpu_sys[i];
                this.cpuPrev.xcpu_nice[i] = this.cpu.xcpu_nice[i];
                this.cpuPrev.xcpu_total[i] = this.cpu.xcpu_total[i];
            }

            this._buildMeter(hbox);
            this._buildMenu();

            this.cpuUsage = 0;
            this.cpuCoreUsage = new Array(this.cpuCores);
            this.refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_CPU, () => this.refresh());
        }

        _buildMeter(parent) {
            this.meter = new St.DrawingArea({ style_class: 'meter' });
            // Leave 1px of padding between each bar
            let meterWidth = Config.CPU_BAR_WIDTH * this.cpuCores + this.cpuCores - 1;
            this.meter.style = `width: ${meterWidth}px;`;
            parent.add_child(this.meter);
            this.meter.connect('repaint', () => this.repaint());
        }

        _buildMenu() {
            let statusMenu = new PopupMenu.PopupMenuSection();
            let grid = new St.Widget({
                style_class: 'menu-grid',
                layout_manager: new Clutter.GridLayout({ orientation: Clutter.Orientation.VERTICAL }),
            });
            let lm = grid.layout_manager;
            statusMenu.box.add_child(grid);

            let label = new St.Label({ text: 'CPU usage:', style_class: 'menu-label' });
            lm.attach(label, 0, 0, 1, 1);
            this.menuCpuUsage = new St.Label({ text: '0%', style_class: 'menu-value' });
            lm.attach(this.menuCpuUsage, 1, 0, 1, 1);

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
            GTop.glibtop_get_cpu(this.cpu);

            // Total CPU usage
            let userDelta = this.cpu.user - this.cpuPrev.user;
            let sysDelta = this.cpu.sys - this.cpuPrev.sys;
            let niceDelta = this.cpu.nice - this.cpuPrev.nice;
            let totalDelta = this.cpu.total - this.cpuPrev.total;
            this.cpuUsage = Math.round(100 * (userDelta + sysDelta + niceDelta) / totalDelta);

            // Per-core CPU usage
            for (let i = 0; i < this.cpuCores; i++) {
                userDelta = this.cpu.xcpu_user[i] - this.cpuPrev.xcpu_user[i];
                sysDelta = this.cpu.xcpu_sys[i] - this.cpuPrev.xcpu_sys[i];
                niceDelta = this.cpu.xcpu_nice[i] - this.cpuPrev.xcpu_nice[i];
                totalDelta = this.cpu.xcpu_total[i] - this.cpuPrev.xcpu_total[i];
                this.cpuCoreUsage[i] = Math.round(100 * (userDelta + sysDelta + niceDelta) / totalDelta);
            }

            // Save values
            this.cpuPrev.user = this.cpu.user;
            this.cpuPrev.sys = this.cpu.sys;
            this.cpuPrev.nice = this.cpu.nice;
            this.cpuPrev.total = this.cpu.total;
            for (let i = 0; i < this.cpuCores; i++) {
                this.cpuPrev.xcpu_user[i] = this.cpu.xcpu_user[i];
                this.cpuPrev.xcpu_sys[i] = this.cpu.xcpu_sys[i];
                this.cpuPrev.xcpu_nice[i] = this.cpu.xcpu_nice[i];
                this.cpuPrev.xcpu_total[i] = this.cpu.xcpu_total[i];
            }

            // Update UI
            // log(`[TopHat] CPU: ${this.cpuUsage}% on ${this.cpuCores} cores (${this.cpuCoreUsage.join()})`);
            // this.valueCPU.text = `${this.cpuUsage}%`;
            this.menuCpuUsage.text = `${this.cpuUsage}%`;
            this.meter.queue_repaint();

            return true;
        }

        repaint() {
            let [width, height] = this.meter.get_surface_size();
            let barWidth = Math.floor((width - (this.cpuCores - 1)) / this.cpuCores);

            let ctx = this.meter.get_context();
            var _, fg, bg;
            [_, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [_, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            if (Config.CPU_SHOW_CORES) {
                Clutter.cairo_set_source_color(ctx, fg);
                for (let i = 0; i < this.cpuCores; i++) {
                    let barHeight = Math.ceil(this.cpuCoreUsage[i] / 100.0 * height);
                    let x = i * barWidth + i;
                    let y = height - barHeight;
                    ctx.rectangle(x, y, barWidth - 1, barHeight);
                }
                ctx.fill();
            } else {
                Clutter.cairo_set_source_color(ctx, fg);
                let fillHeight = Math.ceil(this.cpuUsage / 100.0 * height);
                ctx.rectangle(0, height - fillHeight, width, height);
                ctx.fill();
            }
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

// Exploration of vertical labels (but not an efficient way to do this)
//
// const Pango = imports.gi.Pango;
// const PangoCairo = imports.gi.PangoCairo;
// this.label = new St.DrawingArea({ style_class: 'label' });
// hbox.add_child(this.label);
// this.label.connect('repaint', () => {
//     log('repaint');
//     let font = Pango.FontDescription.from_string('Monospace 8');
//     let ctx = this.label.get_context();
//     // let [width, height] = this.meter.get_surface_size();
//     var _, fg;
//     [_, fg] = Clutter.Color.from_string('#eee');
//     Clutter.cairo_set_source_color(ctx, fg);
//     let layout = PangoCairo.create_layout(ctx);
//     layout.set_font_description(font);
//     layout.set_line_spacing(0.8);
//     layout.set_text('C\rP\rU', 5);
//     PangoCairo.show_layout(ctx, layout);
// });
// this.label.queue_repaint();
