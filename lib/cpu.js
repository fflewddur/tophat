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
const ngettext = Config.Domain.ngettext;

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
        this.hasTemp = true; // will change to false if we can't read hwmon temperatures
        this.refreshChartsTimer = 0;
        this.refreshProcessesTimer = 0;

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/cpu-icon-symbolic.svg`);
        this.icon = new St.Icon({gicon, style_class: 'system-status-icon tophat-panel-icon'});
        this.add_child(this.icon);

        this.usage = new St.Label({
            text: '',
            style_class: 'tophat-panel-usage',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.usage);

        configHandler.settings.bind('show-cpu', this, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('refresh-rate', this, 'refresh-rate', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('show-icons', this.icon, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('meter-bar-width', this, 'meter-bar-width', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('meter-fg-color', this, 'meter-fg-color', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('cpu-show-cores', this, 'show-cores', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('show-animations', this, 'show-animation', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('cpu-display', this, 'visualization', Gio.SettingsBindFlags.GET);

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

    _startTimers() {
        // Clear the history chart and configure it for the current refresh rate
        this.history = [];
        let updateInterval = this.computeSummaryUpdateInterval(Config.UPDATE_INTERVAL_CPU);
        this.historyLimit = Config.HISTORY_MAX_SIZE * 1000 / updateInterval;

        if (this.refreshChartsTimer === 0) {
            this.refreshChartsTimer = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                updateInterval,
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
        this.historyChart.connect('repaint', () => this._repaintHistory());
        this.addMenuRow(this.historyChart, 0, 2, 1);

        let limitInMins = Config.HISTORY_MAX_SIZE / 60;
        let startLabel = ngettext('%d min ago', '%d mins ago', limitInMins).format(limitInMins);
        label = new St.Label({text: startLabel, style_class: 'chart-label-then'});
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

    _buildCPUDetailRows() {
        let grid = new St.Widget({
            layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        });
        this.menuCpuDetails = grid.layout_manager;
        this.addMenuRow(grid, 0, 2, 1);

        this._findTempMonitors().then(hasTemp => {
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
                this.menuCpuTemps = [];
                const nRows = 3;

                // If we don't have temp data, consolidate CPU details into one section
                // since they'll all be the same
                let cpuSections = hasTemp ? cpus.size : 1;
                for (let i = 0; i < cpuSections; i++) {
                    // Model
                    let label = new St.Label({
                        text: _('model n/a'),
                        style_class: 'menu-label menu-details',
                        x_expand: true,
                    });
                    this.menuCpuDetails.attach(label, 0, i * nRows, 2, 1);
                    this.menuCpuModels.push(label);

                    // Frequency
                    label = new St.Label({
                        text: _('Frequency:'),
                        style_class: 'menu-label menu-details',
                    });
                    this.menuCpuDetails.attach(label, 0, i * nRows + 1, 1, 1);

                    label = new St.Label({
                        text: _('n/a'),
                        style_class: 'menu-value menu-details',
                    });
                    this.menuCpuDetails.attach(label, 1, i * nRows + 1, 1, 1);
                    this.menuCpuFreqs.push(label);

                    // Temperature
                    label = new St.Label({
                        text: _('Temperature:'),
                        style_class: 'menu-label menu-details menu-section-end',
                    });
                    this.menuCpuDetails.attach(label, 0, i * nRows + 2, 1, 1);

                    label = new St.Label({
                        text: _('n/a'),
                        style_class: 'menu-value menu-details menu-section-end',
                    });
                    this.menuCpuDetails.attach(label, 1, i * nRows + 2, 1, 1);
                    this.menuCpuTemps.push(label);
                }
            }).catch(err => {
                log(`[${Me.metadata.name}] Error reading /proc/cpuinfo: ${err}`);
                this.hasProc = false;
            });
        }).catch(err => {
            log(`[${Me.metadata.name}] Error finding temperature monitors: ${err}`);
            this.hasTemp = false;
        });
    }

    _findTempMonitors() {
        return new Promise((resolve, reject) => {
            const basePath = '/sys/class/hwmon/';
            this.cpuTempMonitors = new Map();

            new FileModule.File(basePath).list().then(files => {
                for (let file of files) {
                    const path = `${basePath}${file}/name`;
                    const name = new FileModule.File(path).readSync();
                    // CPU should be named 'coretemp' for Intel CPUs or "k10temp" for AMD CPUs
                    if (name === 'coretemp') {
                        // determine which processor (socket) we are dealing with
                        const prefix = new FileModule.File(`${basePath}${file}/temp1_label`).readSync();
                        let values = '', id = 0;
                        if (prefix !== null && (values = prefix.match(/Package id\s*(\d+)/))) {
                            id = parseInt(values[1]);
                        }
                        const inputPath = `${basePath}${file}/temp1_input`;
                        if (new FileModule.File(inputPath).exists()) {
                            this.cpuTempMonitors.set(id, inputPath);
                        }
                    } else if (name === 'k10temp') {
                        // AMD Processors (temp2 is Tdie, temp1 is Tctl)
                        let inputPath = `${basePath}${file}/temp2_input`;
                        const f = new FileModule.File(inputPath);
                        if (!f.exists()) {
                            inputPath = `${basePath}${file}/temp1_input`;
                        }
                        // FIXME: Instead of key=0 here, try to figure out which physical CPU
                        // this monitor represents
                        this.cpuTempMonitors.set(0, inputPath);
                    }
                }
                resolve(this.cpuTempMonitors.size > 0);
            }).catch(err => {
                log(`[${Me.metadata.name}] Error listing files in ${basePath}: ${err}`);
                reject(err);
            });
        });
    }

    refresh() {
        this._refreshCharts();
        this._refreshProcesses();
    }

    _refreshCharts() {
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
        while (this.history.length >= this.historyLimit) {
            this.history.shift();
        }
        this.history.push(this.cpuUsage.copy());

        // Update UI
        // log(`[TopHat] CPU: ${this.cpuUsage}% on ${this.cpuCores} cores (${this.cpuCoreUsage.join()})`);
        let cpuTotal = this.cpuUsage.total();
        this.usage.text = `${cpuTotal}%`;

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
            }
            if (this.menuCpuFreqs && this.menuCpuModels) {
                cpuInfo.forEach(info => {
                    if (this.menuCpuModels[info.id] !== undefined) {
                        this.menuCpuModels[info.id].text = info.model;
                    }
                    if (this.menuCpuFreqs[info.id] !== undefined) {
                        this.menuCpuFreqs[info.id].text = `${(info.freq / info.cores / 1000).toFixed(1)} GHz`;
                    }
                });
            }
        }).catch(err => {
            log(`[${Me.metadata.name}] Error reading /proc/cpuinfo: ${err}`);
            this.hasProc = false;
        });
    }

    _readCPUTemps() {
        this.cpuTempMonitors.forEach((path, id) => {
            new FileModule.File(path).read().then(temp => {
                temp = parseInt(temp);
                this.menuCpuTemps[id].text = `${(temp / 1000).toFixed(0)} °C`;
            }).catch(err => {
                log(`[${Me.metadata.name}] Error reading ${path}: ${err}`);
                this.hasTemp = false;
            });
        });
    }

    _refreshProcesses() {
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

        // Get the top processes by CPU usage
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

        // Also fetch latest CPU temperature
        if (this.hasTemp && this.cpuTempMonitors.size > 0) {
            this._readCPUTemps();
        }

        return true;
    }

    _repaintHistory() {
        let [width, height] = this.historyChart.get_surface_size();
        let pointSpacing = width / (this.historyLimit - 1);
        let xStart = (this.historyLimit - this.history.length) * pointSpacing;
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
        this._stopTimers();
        Gio.Settings.unbind(this, 'visible');
        Gio.Settings.unbind(this.icon, 'visible');
        Gio.Settings.unbind(this, 'meter-fg-color');
        Gio.Settings.unbind(this, 'meter-bar-width');
        Gio.Settings.unbind(this, 'show-cores');
        Gio.Settings.unbind(this, 'show-animation');
        super.destroy();
    }
});
