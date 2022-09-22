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

/* exported MemMonitor */

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

class MemUse {
    constructor(mem = 0, swap = 0) {
        this.mem = mem;
        this.swap = swap;
    }

    copy() {
        return new MemUse(this.mem, this.swap);
    }
}

class ProcessMemUse {
    constructor(pid = 0) {
        this.pid = pid;
        this.cmd = '';
        this.resident = 0;
        this.share = 0;
    }

    updateMem(mem) {
        this.resident = mem.resident;
        this.share = mem.share;
    }

    memUsage() {
        return ((this.resident - this.share) / 1024 / 1024).toFixed(1);
    }

    toString() {
        return `{cmd: ${this.cmd} mem: ${this.memUsage()} MB pid: ${this.pid}}`;
    }
}

var MemMonitor = GObject.registerClass(
    class TopHatMemMonitor extends Monitor.TopHatMonitor {
        _init(settings) {
            super._init(`${Me.metadata.name} Memory Monitor`);

            // Initialize libgtop values
            this.mem = new GTop.glibtop_mem();
            this.swap = new GTop.glibtop_swap();
            this.memUsage = new MemUse();
            this.history = new Array(0);
            this.processes = new Map();

            let hbox = new St.BoxLayout();
            this.add_child(hbox);

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/mem-icon.svg`);
            let icon = new St.Icon({gicon, icon_size: 16, style_class: 'system-status-icon tophat-panel-icon'});
            hbox.add_child(icon);

            this._buildMeter(hbox);
            this._buildMenu();

            this.refreshChartsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_MEM, () => this.refreshCharts());
            this.refreshProcessesTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this.refreshProcesses());

            settings.bind('show-mem', this, 'visible', Gio.SettingsBindFlags.DEFAULT);
            settings.bind('show-icons', icon, 'visible', Gio.SettingsBindFlags.DEFAULT);
        }

        _buildMeter(parent) {
            this.meter = new St.DrawingArea({style_class: 'meter'});
            parent.add_child(this.meter);
            this.meter.connect('repaint', () => this.repaintMeter());
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
            let label = new St.Label({text: _('Memory usage'), style_class: 'menu-header'});
            lm.attach(label, 0, row, 2, 1);
            row++;

            label = new St.Label({text: _('RAM used:'), style_class: 'menu-label'});
            lm.attach(label, 0, row, 1, 1);
            this.menuMemUsage = new St.Label({text: '0%', style_class: 'menu-value'});
            lm.attach(this.menuMemUsage, 1, row, 1, 1);
            row++;

            label = new St.Label({text: _('Swap used:'), style_class: 'menu-label'});
            lm.attach(label, 0, row, 1, 1);
            this.menuSwapUsage = new St.Label({text: '0%', style_class: 'menu-value'});
            lm.attach(this.menuSwapUsage, 1, row, 1, 1);
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

            label = new St.Label({text: _('Top processes'), style_class: 'menu-header'});
            lm.attach(label, 0, row, 2, 1);
            row++;

            this.topProcesses = [];
            for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
                let cmd = new St.Label({text: '', style_class: 'menu-cmd-name'});
                lm.attach(cmd, 0, row, 1, 1);
                let usage = new St.Label({text: '', style_class: 'menu-mem-usage'});
                lm.attach(usage, 1, row, 1, 1);
                let p = new Shared.TopProcess(cmd, usage);
                this.topProcesses.push(p);
                row++;
            }

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
            GTop.glibtop_get_mem(this.mem);
            let memTotal = this.mem.total / 1024 / 1024;
            let memUsed = (this.mem.used - this.mem.cached) / 1024 / 1024;
            // log(`[TopHat] total=${this.mem.total / 1024 / 1024} used=${this.mem.used / 1024 / 1024} free=${this.mem.free / 1024 / 1024} cached=${this.mem.cached / 1024 / 1024} buffer=${this.mem.buffer / 1024 / 1024} shared=${this.mem.shared / 1024 / 1024} user=${this.mem.user / 1024 / 1024}`);
            this.memUsage.mem = Math.round(memUsed / memTotal * 100);
            this.menuMemUsage.text = `${this.memUsage.mem}%`;

            GTop.glibtop_get_swap(this.swap);
            let swapTotal = this.swap.total / 1024 / 1024;
            let swapUsed = this.swap.used / 1024 / 1024;
            this.memUsage.swap = Math.round(swapUsed / swapTotal * 100);
            this.menuSwapUsage.text = `${this.memUsage.swap}%`;
            while (this.history.length >= Config.HISTORY_MAX_SIZE) {
                this.history.shift();
            }
            this.history.push(this.memUsage.copy());

            this.meter.queue_repaint();
            this.historyChart.queue_repaint();

            return true;
        }

        refreshProcesses() {
            // Build list of N most memory-hungry processes
            let processes = Shared.getProcessList();

            let updatedProcesses = new Map();
            processes.forEach(pid => {
                let procInfo = this.processes.get(pid);
                if (procInfo === undefined) {
                    procInfo = new ProcessMemUse(pid);
                    procInfo.cmd = Shared.getProcessName(pid);
                }

                if (procInfo.cmd) {
                    let mem = new GTop.glibtop_proc_mem();
                    GTop.glibtop_get_proc_mem(mem, pid);
                    procInfo.updateMem(mem);
                    updatedProcesses.set(pid, procInfo);
                }
            });
            this.processes = updatedProcesses;

            // Get the top 5 processes by CPU usage
            let procList = new Array(0);
            this.processes.forEach(e => {
                if (e.memUsage() > 0) {
                    procList.push(e);
                }
            });
            procList.sort((a, b) => {
                return b.memUsage() - a.memUsage();
            });
            procList = procList.slice(0, Config.N_TOP_PROCESSES);
            while (procList.length < Config.N_TOP_PROCESSES) {
                // If we don't have at least N_TOP_PROCESSES active, fill out
                // the array with empty ones
                procList.push(new ProcessMemUse());
            }
            for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
                this.topProcesses[i].cmd.text = procList[i].cmd;
                let memUse = '';
                if (procList[i].cmd) {
                    // TODO: Switch to GB when this number gets too large
                    memUse = `${procList[i].memUsage()} MB`;
                }
                this.topProcesses[i].usage.text = memUse;
            }

            return true;
        }

        repaintMeter() {
            let [width, height] = this.meter.get_surface_size();
            let ctx = this.meter.get_context();
            var fg, bg;
            [, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            Clutter.cairo_set_source_color(ctx, fg);
            let fillHeight = Math.ceil(this.memUsage.mem / 100.0 * height);
            ctx.rectangle(0, height - fillHeight, width, height);
            ctx.fill();

            ctx.$dispose();
        }

        repaintHistory() {
            let [width, height] = this.historyChart.get_surface_size();
            let pointSpacing = width / (Config.HISTORY_MAX_SIZE - 1);
            let xStart = (Config.HISTORY_MAX_SIZE - this.history.length) * pointSpacing;
            let ctx = this.historyChart.get_context();
            var fg, bg;
            [, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            Clutter.cairo_set_source_color(ctx, fg);
            ctx.moveTo(xStart, height);
            for (let i = 0; i < this.history.length; i++) {
                let pointHeight = Math.ceil(this.history[i].mem / 100.0 * height);
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
            if (this.refreshChartsTimer !== 0) {
                GLib.source_remove(this.refreshChartsTimer);
                this.refreshChartsTimer = 0;
            }
            if (this.refreshProcessesTimer !== 0) {
                GLib.source_remove(this.refreshProcessesTimer);
                this.refreshProcessesTimer = 0;
            }
            super.destroy();
        }
    });
