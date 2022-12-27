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

/* exported CpuMonitor */

const {Gio, GLib, Clutter, GObject, St, GTop} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const Shared = Me.imports.lib.shared;
const Monitor = Me.imports.lib.monitor;
const FileModule = Me.imports.lib.file;
const _ = Config.Domain.gettext;

class CPUUse {
    constructor(user = 0, sys = 0) {
        this.user = user;
        this.sys = sys;
    }

    computeFromIdle(userUsage, idleUsage) {
        this.user = userUsage;
        this.sys = 100 - userUsage - idleUsage;
    }

    total() {
        return this.user + this.sys;
    }

    copy() {
        return new CPUUse(this.user, this.sys);
    }
}

class ProcessCPUUse {
    constructor(pid = 0) {
        this.pid = pid;
        this.cmd = '';
        this.cpuTimeNow = 0;
        this.cpuTimePrev = 0;
    }

    updateTime(time) {
        this.cpuTimePrev = this.cpuTimeNow;
        this.cpuTimeNow = time.rtime;
        this.freq = time.frequency;
    }

    cpuTime() {
        return this.cpuTimeNow - this.cpuTimePrev;
    }

    cpuUsage() {
        if (this.freq === 0) {
            return 0;
        }
        return this.cpuTime() / this.freq * Shared.SECOND_AS_MILLISECONDS / Config.UPDATE_INTERVAL_PROCLIST;
    }

    toString() {
        return `use: ${this.cpuUsage()} cmd: ${this.cmd} pid: ${this.pid}`;
    }
}

var CpuMonitor = GObject.registerClass({
    Properties: {
        'show-cores': GObject.ParamSpec.boolean(
            'show-cores',
            'Show cores',
            'True if each CPU core should have its own bar',
            GObject.ParamFlags.READWRITE,
            true
        ),
    },
}, class TopHatCpuMonitor extends Monitor.TopHatMonitor {
    _init(configHandler) {
        super._init(`${Me.metadata.name} CPU Monitor`);

        // Initialize libgtop values
        this.cpuCores = GTop.glibtop_get_sysinfo().ncpu;
        this.cpu = new GTop.glibtop_cpu();
        GTop.glibtop_get_cpu(this.cpu);
        this.cpuUsage = new CPUUse();
        this.cpuCoreUsage = new Array(this.cpuCores);
        this.cpuPrev = {
            user: this.cpu.user,
            idle: this.cpu.idle,
            total: this.cpu.total,
            xcpu_user: new Array(this.cpuCores),
            xcpu_idle: new Array(this.cpuCores),
            xcpu_total: new Array(this.cpuCores),
        };
        for (let i = 0; i < this.cpuCores; i++) {
            this.cpuPrev.xcpu_user[i] = this.cpu.xcpu_user[i];
            this.cpuPrev.xcpu_idle[i] = this.cpu.xcpu_idle[i];
            this.cpuPrev.xcpu_total[i] = this.cpu.xcpu_total[i];
            this.cpuCoreUsage[i] = new CPUUse();
        }
        this.history = new Array(0);
        this.processes = new Map();
        let f = new FileModule.File('/proc/cpuinfo');
        this.hasProc = f.exists();

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/cpu-icon.svg`);
        let icon = new St.Icon({gicon, style_class: 'system-status-icon tophat-panel-icon'});
        this.add_child(icon);

        configHandler.settings.bind('show-cpu', this, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('show-icons', icon, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('meter-bar-width', this, 'meter-bar-width', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('meter-fg-color', this, 'meter-fg-color', Gio.SettingsBindFlags.GET);
        configHandler.connect_boolean('cpu-show-cores', this, 'show-cores');
        configHandler.connect_boolean('show-animations', this, 'show-animation');

        this._buildMeter();
        this._buildMenu();

        this.refreshChartsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_CPU, () => this.refreshCharts());
        this.refreshProcessesTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this.refreshProcesses());
    }

    get show_cores() {
        if (this._show_cores === undefined) {
            this._show_cores = true;
        }
        return this._show_cores;
    }

    set show_cores(value) {
        if (this._show_cores === value) {
            return;
        }
        this._show_cores = value;
        this._buildMeter();
        this.notify('show-cores');
    }

    _buildMeter() {
        let numBars = 1;
        if (this.show_cores) {
            numBars = this.cpuCores;
        }
        this.setMeter(new Monitor.Meter(numBars, this.meter_bar_width));
    }

    _buildMenu() {
        let label = new St.Label({text: _('Processor usage'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 2, 1);

        label = new St.Label({text: _('Processor utilization:'), style_class: 'menu-label menu-section-end'});
        this.addMenuRow(label, 0, 1, 1);
        this.menuCpuUsage = new St.Label({text: '0%', style_class: 'menu-value menu-section-end'});
        this.addMenuRow(this.menuCpuUsage, 1, 1, 1);

        if (this.hasProc) {
            this._buildCPUDetailRows();
        }

        this.historyChart = new St.DrawingArea({style_class: 'chart'});
        this.historyChart.connect('repaint', () => this.repaintHistory());
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
            let usage = new St.Label({text: '', style_class: 'menu-cmd-usage'});
            this.addMenuRow(usage, 1, 1, 1);
            let p = new Shared.TopProcess(cmd, usage);
            this.topProcesses.push(p);
        }

        this.buildMenuButtons();
    }

    refreshCharts() {
        GTop.glibtop_get_cpu(this.cpu);

        // Total CPU usage
        let userDelta = this.cpu.user - this.cpuPrev.user;
        let idleDelta = this.cpu.idle - this.cpuPrev.idle;
        let totalDelta = this.cpu.total - this.cpuPrev.total;
        let idleUsage = Math.round(100 * idleDelta / totalDelta);
        let userUsage = Math.round(100 * userDelta / totalDelta);
        this.cpuUsage.computeFromIdle(userUsage, idleUsage);

        // Per-core CPU usage
        for (let i = 0; i < this.cpuCores; i++) {
            userDelta = this.cpu.xcpu_user[i] - this.cpuPrev.xcpu_user[i];
            idleDelta = this.cpu.xcpu_idle[i] - this.cpuPrev.xcpu_idle[i];
            totalDelta = this.cpu.xcpu_total[i] - this.cpuPrev.xcpu_total[i];
            let coreIdleUsage = Math.round(100 * idleDelta / totalDelta);
            let coreUserUsage = Math.round(100 * userDelta / totalDelta);
            this.cpuCoreUsage[i].computeFromIdle(coreUserUsage, coreIdleUsage);
        }

        // Save values
        this.cpuPrev.user = this.cpu.user;
        this.cpuPrev.idle = this.cpu.idle;
        this.cpuPrev.total = this.cpu.total;
        for (let i = 0; i < this.cpuCores; i++) {
            this.cpuPrev.xcpu_user[i] = this.cpu.xcpu_user[i];
            this.cpuPrev.xcpu_idle[i] = this.cpu.xcpu_idle[i];
            this.cpuPrev.xcpu_total[i] = this.cpu.xcpu_total[i];
        }
        while (this.history.length >= Config.HISTORY_MAX_SIZE) {
            this.history.shift();
        }
        this.history.push(this.cpuUsage.copy());

        // Update UI
        // log(`[TopHat] CPU: ${this.cpuUsage}% on ${this.cpuCores} cores (${this.cpuCoreUsage.join()})`);
        let cpuTotal = this.cpuUsage.total();
        if (cpuTotal < 1) {
            cpuTotal = '< 1';
        }
        this.menuCpuUsage.text = `${cpuTotal}%`;
        this.historyChart.queue_repaint();

        // Update panel meter
        let usage = [];
        if (this.show_cores) {
            usage = new Array(this.cpuCores);
            for (let i = 0; i < this.cpuCores; i++) {
                usage[i] = this.cpuCoreUsage[i].total();
            }
        } else {
            usage = [this.cpuUsage.total()];
        }
        this.meter.setUsage(usage);

        if (this.hasProc) {
            this._readCPUInfo();
        }

        return true;
    }

    _buildCPUDetailRows() {
        let grid = new St.Widget({
            // style_class: 'menu-grid-details',
            layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        });
        this.menuCpuDetails = grid.layout_manager;
        this.addMenuRow(grid, 0, 2, 1);

        new FileModule.File('/proc/cpuinfo').read().then(lines => {
            const cpus = new Set();
            const blocks = lines.split('\n\n');
            for (const block of blocks) {
                let values = '';
                if ((values = block.match(/physical id\s*:\s*(\d+)/))) {
                    let id = parseInt(values[1]);
                    cpus.add(id);
                }
            }

            this.menuCpuModels = [];
            this.menuCpuFreqs = [];
            for (let i = 0; i < cpus.size; i++) {
                let label = new St.Label({
                    text: 'model n/a',
                    style_class: 'menu-label menu-details',
                    x_expand: true,
                });
                this.menuCpuDetails.attach(label, 0, 0, 2, 1);
                this.menuCpuModels.push(label);

                label = new St.Label({
                    text: _('Current frequency:'),
                    style_class: 'menu-label menu-details menu-section-end',
                });
                this.menuCpuDetails.attach(label, 0, 1, 1, 1);

                label = new St.Label({
                    text: 'n/a',
                    style_class: 'menu-value menu-details menu-section-end',
                });
                this.menuCpuDetails.attach(label, 1, 1, 1, 1);
                this.menuCpuFreqs.push(label);
            }
        }).catch(err => {
            log(`[${Me.metadata.name}] Error reading /proc/cpuinfo: ${err}`);
        });
    }

    _readCPUInfo() {
        new FileModule.File('/proc/cpuinfo').read().then(lines => {
            let values = '';

            let cpuInfo = new Map();
            let blocks = lines.split('\n\n');
            for (const block of blocks) {
                let id, freq = 0, model = '';
                if ((values = block.match(/physical id\s*:\s*(\d+)/))) {
                    id = parseInt(values[1]);
                }
                let info = cpuInfo.get(id);
                if (info === undefined) {
                    info = {id, freq: 0, cores: 0, model: ''};
                }
                info.cores += 1;

                if ((values = block.match(/cpu MHz\s*:\s*(\d+)/))) {
                    freq = parseInt(values[1]);
                    info.freq += freq;
                }
                if ((values = block.match(/model name\s*:\s*(.+)\n/))) {
                    model = values[1];
                    info.model = model;
                }

                cpuInfo.set(id, info);
                // log(`id: '${id}' info.id: '${info.id}' typeof(id): '${typeof id}' typeof(info.id): '${typeof info.id}' freq: ${info.freq} model: ${info.model} cpuInfo.has(id): ${cpuInfo.has(id)}`);
            }
            if (this.menuCpuFreqs && this.menuCpuModels) {
                cpuInfo.forEach(info => {
                    // log(`processor id: ${info.id} freq: ${(info.freq / info.cores / 1000).toFixed(1)} GHz model: ${info.model}`);
                    this.menuCpuModels[info.id].text = info.model;
                    this.menuCpuFreqs[info.id].text = `${(info.freq / info.cores / 1000).toFixed(1)} GHz`;
                });
            }
        }).catch(err => {
            log(`[${Me.metadata.name}] Error reading /proc/cpuinfo: ${err}`);
        });
    }

    refreshProcesses() {
        // Build list of N most CPU-intensive processes
        let processes = Shared.getProcessList();

        let updatedProcesses = new Map();
        processes.forEach(pid => {
            let procInfo = this.processes.get(pid);
            if (procInfo === undefined) {
                procInfo = new ProcessCPUUse(pid);
                procInfo.cmd = Shared.getProcessName(pid);
            }

            if (procInfo.cmd) {
                let time = new GTop.glibtop_proc_time();
                GTop.glibtop_get_proc_time(time, pid);
                procInfo.updateTime(time);
                updatedProcesses.set(pid, procInfo);
            }
        });
        this.processes = updatedProcesses;

        // Get the top 5 processes by CPU usage
        let procList = new Array(0);
        this.processes.forEach(e => {
            if (e.cpuTime() > 0) {
                procList.push(e);
            }
        });
        procList.sort((a, b) => {
            return b.cpuTime() - a.cpuTime();
        });
        procList = procList.slice(0, Config.N_TOP_PROCESSES);
        while (procList.length < Config.N_TOP_PROCESSES) {
            // If we don't have at least N_TOP_PROCESSES active, fill out
            // the array with empty ones
            procList.push(new ProcessCPUUse());
        }
        for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
            this.topProcesses[i].cmd.text = procList[i].cmd;
            let cpuUse = '';
            if (procList[i].cmd) {
                cpuUse = procList[i].cpuUsage() * 100 / this.cpuCores;
                if (cpuUse < 1) {
                    cpuUse = '< 1';
                    // cpuUse = cpuUse.toFixed(2);
                } else {
                    cpuUse = Math.round(cpuUse);
                }
                cpuUse += '%';
            }
            this.topProcesses[i].usage.text = cpuUse;
        }
        // log(`[TopHat] ${procList}`);
        return true;
    }

    repaintHistory() {
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
            let pointHeight = Math.ceil(this.history[i].total() / 100.0 * height);
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
