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
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const Shared = Me.imports.lib.shared;
const Monitor = Me.imports.lib.monitor;
const FileModule = Me.imports.lib.file;
const _ = Config.Domain.gettext;

const KB_PER_GB = 1000000; // https://en.wikipedia.org/wiki/Gigabyte

class MemUse {
    constructor(memUsed = 0, memSize = 640, swapUsed = 0, swapSize = 640) {
        this.memSize = memSize;
        this.memUsed = memUsed;
        this.swapSize = swapSize;
        this.swapUsed = swapUsed;
    }

    get mem() {
        return (this._memUsed / this._memSize).toFixed(2);
    }

    get memUsed() {
        if (this._memUsed === undefined) {
            return 0;
        }
        return this._memUsed;
    }

    set memUsed(value) {
        if (this._memUsed === value) {
            return;
        }
        this._memUsed = value;
    }

    get memSize() {
        if (this._memSize === undefined) {
            return 640;
        }
        return this._memSize;
    }

    set memSize(value) {
        if (this._memSize === value) {
            return;
        }
        this._memSize = value;
    }

    get swap() {
        if (this.swapUsed === 0 || this.swapSize === 0) {
            return 0;
        }
        return (this.swapUsed / this.swapSize).toFixed(2);
    }

    get swapUsed() {
        if (this._swapUsed === undefined) {
            return 0;
        }
        return this._swapUsed;
    }

    set swapUsed(value) {
        if (this._swapUsed === value) {
            return;
        }
        this._swapUsed = value;
    }

    get swapSize() {
        if (this._swapSize === undefined) {
            return 640;
        }
        return this._swapSize;
    }

    set swapSize(value) {
        if (this._swapSize === value) {
            return;
        }
        this._swapSize = value;
    }

    copy() {
        return new MemUse(this.memUsed, this.memSize, this.swapUsed, this.swapSize);
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
        return this.resident;
    }

    toString() {
        return `{cmd: ${this.cmd} mem: ${this.memUsage()} B pid: ${this.pid}}`;
    }
}

var MemMonitor = GObject.registerClass(
    class TopHatMemMonitor extends Monitor.TopHatMonitor {
        _init(configHandler) {
            super._init(`${Me.metadata.name} Memory Monitor`);

            // Initialize libgtop values
            this.mem = new GTop.glibtop_mem();
            this.swap = new GTop.glibtop_swap();
            this.memUsage = new MemUse();
            this.history = new Array(0);
            this.processes = new Map();
            let f = new FileModule.File('/proc/meminfo');
            this.hasProc = f.exists();
            this.refreshChartsTimer = 0;
            this.refreshProcessesTimer = 0;

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/mem-icon-symbolic.svg`);
            this.icon = new St.Icon({gicon, style_class: 'system-status-icon tophat-panel-icon'});
            this.add_child(this.icon);

            this.usage = new St.Label({
                text: '',
                style_class: 'tophat-panel-usage',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this.usage);

            configHandler.settings.bind('show-mem', this, 'visible', Gio.SettingsBindFlags.GET);
            configHandler.settings.bind('refresh-rate', this, 'refresh-rate', Gio.SettingsBindFlags.GET);
            configHandler.settings.bind('show-icons', this.icon, 'visible', Gio.SettingsBindFlags.GET);
            configHandler.settings.bind('meter-fg-color', this, 'meter-fg-color', Gio.SettingsBindFlags.GET);
            configHandler.settings.bind('meter-bar-width', this, 'meter-bar-width', Gio.SettingsBindFlags.GET);
            configHandler.settings.bind('show-animations', this, 'show-animation', Gio.SettingsBindFlags.GET);
            configHandler.settings.bind('mem-display', this, 'visualization', Gio.SettingsBindFlags.GET);

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

            this._buildMeter();
            this._buildMenu();
            this._startTimers();
        }

        _startTimers() {
            // Clear the history chart
            this.history = [];

            if (this.refreshChartsTimer === 0) {
                this.refreshChartsTimer = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    this.computeSummaryUpdateInterval(Config.UPDATE_INTERVAL_MEM),
                    () => this._refreshCharts()
                );
            }
            if (this.refreshProcessesTimer === 0) {
                this.refreshProcessesTimer = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    this.computeDetailsUpdateInterval(Config.UPDATE_INTERVAL_PROCLIST),
                    () => this._refreshProcesses()
                );
            }
        }

        _stopTimers() {
            if (this.refreshChartsTimer !== 0) {
                GLib.source_remove(this.refreshChartsTimer);
                this.refreshChartsTimer = 0;
            }
            if (this.refreshProcessesTimer !== 0) {
                GLib.source_remove(this.refreshProcessesTimer);
                this.refreshProcessesTimer = 0;
            }
        }

        _buildMeter() {
            this.setMeter(new Monitor.Meter(1, this.meter_bar_width));
        }

        _buildMenu() {
            let label = new St.Label({text: _('Memory usage'), style_class: 'menu-header'});
            this.addMenuRow(label, 0, 2, 1);

            label = new St.Label({text: _('RAM used:'), style_class: 'menu-label'});
            this.addMenuRow(label, 0, 1, 1);
            this.menuMemUsage = new St.Label({text: '0%', style_class: 'menu-value'});
            this.addMenuRow(this.menuMemUsage, 1, 1, 1);
            this.menuMemSize = new St.Label({
                text: _('size n/a'),
                style_class: 'menu-value menu-details menu-section-end',
            });
            this.addMenuRow(this.menuMemSize, 0, 2, 1);

            label = new St.Label({text: _('Swap used:'), style_class: 'menu-label'});
            this.addMenuRow(label, 0, 1, 1);
            this.menuSwapUsage = new St.Label({text: '0%', style_class: 'menu-value'});
            this.addMenuRow(this.menuSwapUsage, 1, 1, 1);
            this.menuSwapSize = new St.Label({
                text: _('size n/a'),
                style_class: 'menu-value menu-details menu-section-end',
            });
            this.addMenuRow(this.menuSwapSize, 0, 2, 1);

            this.historyChart = new St.DrawingArea({style_class: 'chart'});
            this.historyChart.connect('repaint', () => this._repaintHistory());
            this.addMenuRow(this.historyChart, 0, 2, 1);

            // FIXME: Don't hardcode this, base it on Config.HISTORY_MAX_SIZE
            label = new St.Label({text: _('2 mins ago'), style_class: 'chart-label-then'});
            this.addMenuRow(label, 0, 1, 1);
            label = new St.Label({text: _('now'), style_class: 'chart-label-now'});
            this.addMenuRow(label, 1, 1, 1);

            label = new St.Label({text: _('Top processes'), style_class: 'menu-header'});
            this.addMenuRow(label, 0, 2, 1);

            this.topProcesses = [];
            for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
                let cmd = new St.Label({text: '', style_class: 'menu-cmd-name'});
                this.addMenuRow(cmd, 0, 1, 1);
                let usage = new St.Label({text: '', style_class: 'menu-mem-usage'});
                this.addMenuRow(usage, 1, 1, 1);
                let p = new Shared.TopProcess(cmd, usage);
                this.topProcesses.push(p);
            }

            this.buildMenuButtons();
        }

        refresh() {
            this._refreshCharts();
            this._refreshProcesses();
        }

        _refreshCharts() {
            if (this.hasProc) {
                this._readMemInfo();
            } else {
                GTop.glibtop_get_mem(this.mem);
                let memTotal = this.mem.total / KB_PER_GB;
                let memUsed = (this.mem.used - this.mem.cached) / KB_PER_GB;

                this.memUsage.memUsed = memUsed;
                this.memUsage.memSize = memTotal;
                this.menuMemUsage.text = `${(this.memUsage.mem * 100).toFixed(0)}%`;

                GTop.glibtop_get_swap(this.swap);
                this.memUsage.swapSize = this.swap.total / KB_PER_GB;
                this.memUsage.swapUsed = this.swap.used / KB_PER_GB;
                this.menuSwapUsage.text = `${(this.memUsage.swap * 100).toFixed(0)}%`;
            }

            while (this.history.length >= Config.HISTORY_MAX_SIZE) {
                this.history.shift();
            }
            this.history.push(this.memUsage.copy());

            this.historyChart.queue_repaint();

            // Update panel meter
            // log(`setUsage(${this.memUsage.mem} * 100)`);
            this.meter.setUsage([this.memUsage.mem * 100]);
            this.usage.text = `${(this.memUsage.mem * 100).toFixed(0)}%`;

            return true;
        }

        _readMemInfo() {
            new FileModule.File('/proc/meminfo').read().then(lines => {
                let values = '', total = 0, avail = 0, swapTotal = 0, swapFree = 0;

                if ((values = lines.match(/MemTotal:(\s+)(\d+) kB/))) {
                    total = values[2];
                }
                if ((values = lines.match(/MemAvailable:(\s+)(\d+) kB/))) {
                    avail = values[2];
                }
                if ((values = lines.match(/SwapTotal:(\s+)(\d+) kB/))) {
                    swapTotal = values[2];
                }
                if ((values = lines.match(/SwapFree:(\s+)(\d+) kB/))) {
                    swapFree = values[2];
                }

                let used = total - avail;
                let swapUsed = swapTotal - swapFree;

                this.memUsage.memSize = total;
                this.memUsage.memUsed = used;
                this.menuMemUsage.text = `${(this.memUsage.mem * 100).toFixed(0)}%`;
                this.menuMemSize.text = `${(this.memUsage.memUsed / KB_PER_GB).toFixed(1)} GB of ${(this.memUsage.memSize / KB_PER_GB).toFixed(1)} GB`;

                this.memUsage.swapSize = swapTotal;
                this.memUsage.swapUsed = swapUsed;
                this.menuSwapUsage.text = `${(this.memUsage.swap * 100).toFixed(0)}%`;
                this.menuSwapSize.text = `${(this.memUsage.swapUsed / KB_PER_GB).toFixed(1)} GB of ${(this.memUsage.swapSize / KB_PER_GB).toFixed(1)} GB`;
            }).catch(err => {
                log(`[${Me.metadata.name}] Error reading /proc/meminfo: ${err}`);
                this.hasProc = false;
            });
        }

        _refreshProcesses() {
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
                    memUse = `${Shared.bytesToHumanString(procList[i].memUsage())}`;
                }
                this.topProcesses[i].usage.text = memUse;
            }
            return true;
        }

        _repaintHistory() {
            let [width, height] = this.historyChart.get_surface_size();
            let pointSpacing = width / (Config.HISTORY_MAX_SIZE - 1);
            let xStart = (Config.HISTORY_MAX_SIZE - this.history.length) * pointSpacing;
            let ctx = this.historyChart.get_context();
            var fg, bg;
            [, fg] = Clutter.Color.from_string(this.meter_fg_color);
            [, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            Clutter.cairo_set_source_color(ctx, fg);
            ctx.moveTo(xStart, height);
            for (let i = 0; i < this.history.length; i++) {
                let pointHeight = Math.ceil(this.history[i].mem * height);
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
            this._stopTimers();
            Gio.Settings.unbind(this, 'visible');
            Gio.Settings.unbind(this.icon, 'visible');
            Gio.Settings.unbind(this, 'meter-fg-color');
            Gio.Settings.unbind(this, 'meter-bar-width');
            Gio.Settings.unbind(this, 'show-animation');
            super.destroy();
        }
    });
