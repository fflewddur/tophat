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

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GTop from 'gi://GTop';
import St from 'gi://St';

import {gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Config from './config.js';
import * as Shared from './shared.js';
import * as Monitor from './monitor.js';
import * as FileModule from './file.js';

const KB_PER_GB = 1000000; // https://en.wikipedia.org/wiki/Gigabyte

class MemUse {
    constructor(memUsed = 0, memSize = 640, swapUsed = 0, swapSize = 640, cached = 0) {
        this.memSize = memSize;
        this.memUsed = memUsed;
        this.swapSize = swapSize;
        this.swapUsed = swapUsed;
        this.cached = cached;
    }

    get mem() {
        return (this._memUsed / this._memSize).toFixed(2);
    }

    get cac() {
        return (this._cached / this._memSize).toFixed(2);
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

    get cache() {
        if (this.cached === 0) {
            return 0;
        }
        return (this.cached / this.memUsed).toFixed(2);
    }

    get cached() {
        if (this._cached === undefined) {
            return 0;
        }
        return this._cached;
    }

    set cached(value) {
        if (this._cached === value) {
            return;
        }
        this._cached = value;
    }

    copy() {
        return new MemUse(this.memUsed, this.memSize, this.swapUsed, this.swapSize, this.cached);
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

export const MemMonitor = GObject.registerClass({
    Properties: {
        'show-cached': GObject.ParamSpec.boolean(
            'show-cached',
            'Show cached',
            'True if each cached memory should be displayed',
            GObject.ParamFlags.READWRITE,
            true
        ),
        'cached-meter-fg-color': GObject.ParamSpec.string(
            'cached-meter-fg-color',
            'Cached meter foreground color',
            'A hex value representing the color to use to draw the cached meter bars',
            GObject.ParamFlags.READWRITE,
            '#ffffff'
        ),
    },
}, class TopHatMemMonitor extends Monitor.TopHatMonitor {
    _init(configHandler) {
        super._init('[TopHat] Memory Monitor');

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

        let gicon = Gio.icon_new_for_string(`${configHandler.metadata.path}/icons/mem-icon-symbolic.svg`);
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
        configHandler.settings.bind('mem-show-cached', this, 'show-cached', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('cached-meter-fg-color', this, 'cached-meter-fg-color', Gio.SettingsBindFlags.GET);
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
        this._changeChachedVisibility();
    }

    get show_cached() {
        if (this._show_cached === undefined) {
            this._show_cached = true;
        }
        return this._show_cached;
    }

    set show_cached(value) {
        if (this._show_cached === value) {
            return;
        }
        this._show_cached = value;
        this._changeChachedVisibility();
        this.notify('show-cached');
    }

    get cached_meter_fg_color() {
        return this._cached_meter_fg_color;
    }

    set cached_meter_fg_color(value) {
        if (this._cached_meter_fg_color === value) {
            return;
        }
        this._cached_meter_fg_color = value;
        this.notify('cached-meter-fg-color');
    }

    _changeChachedVisibility() {
        if (this.show_cached) {
            this.menuCachedUsage.style_class = this.menuCachedUsage.style_class.replace(' hidden', '');
            this.menuCachedMaxSize.style_class = this.menuCachedMaxSize.style_class.replace(' hidden', '');
            this.cachedLabel.style_class = this.cachedLabel.style_class.replace(' hidden', '');
        } else {
            this.menuCachedUsage.style_class += ' hidden';
            this.menuCachedMaxSize.style_class += ' hidden';
            this.cachedLabel.style_class += ' hidden';
        }
    }

    _startTimers() {
        // Clear the history chart and configure it for the current refresh rate
        this.history = [];
        let updateInterval = this.computeSummaryUpdateInterval(Config.UPDATE_INTERVAL_MEM);
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

        this.cachedLabel = new St.Label({text: _('Cached:'), style_class: 'menu-label'});
        this.addMenuRow(this.cachedLabel, 0, 1, 1);
        this.menuCachedUsage = new St.Label({text: '0%', style_class: 'menu-value'});
        this.addMenuRow(this.menuCachedUsage, 1, 1, 1);
        this.menuCachedMaxSize = new St.Label({
            text: _('size n/a'),
            style_class: 'menu-value menu-details menu-section-end',
        });
        this.addMenuRow(this.menuCachedMaxSize, 0, 2, 1);

        // Create a grid layout for the history chart
        let grid = new St.Widget({
            layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        });
        this.historyGrid = grid.layout_manager;
        this.addMenuRow(grid, 0, 2, 1);

        this.historyChart = new St.DrawingArea({style_class: 'chart', x_expand: true});
        this.historyChart.connect('repaint', () => this._repaintHistory());
        this.historyGrid.attach(this.historyChart, 0, 0, 2, 3);

        label = new St.Label({text: '100%', y_align: Clutter.ActorAlign.START, style_class: 'chart-label'});
        this.historyGrid.attach(label, 2, 0, 1, 1);
        label = new St.Label({text: '50%', y_align: Clutter.ActorAlign.CENTER, style_class: 'chart-label'});
        this.historyGrid.attach(label, 2, 1, 1, 1);
        label = new St.Label({text: '0', y_align: Clutter.ActorAlign.END, style_class: 'chart-label'});
        this.historyGrid.attach(label, 2, 2, 1, 1);

        let limitInMins = Config.HISTORY_MAX_SIZE / 60;
        let startLabel = ngettext('%d min ago', '%d mins ago', limitInMins).format(limitInMins);
        label = new St.Label({text: startLabel, style_class: 'chart-label-then'});
        this.historyGrid.attach(label, 0, 3, 1, 1);
        label = new St.Label({text: _('now'), style_class: 'chart-label-now'});
        this.historyGrid.attach(label, 1, 3, 1, 1);

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

        while (this.history.length >= this.historyLimit) {
            this.history.shift();
        }
        this.history.push(this.memUsage.copy());

        this.historyChart.queue_repaint();

        // Update panel meter
        // console.debug(`setUsage(${this.memUsage.mem} * 100)`);
        this.meter.setUsage([this.memUsage.mem * 100]);
        this.usage.text = `${(this.memUsage.mem * 100).toFixed(0)}%`;

        return true;
    }

    _readMemInfo() {
        new FileModule.File('/proc/meminfo').read().then(lines => {
            let values = '', total = 0, avail = 0, swapTotal = 0, swapFree = 0, cachedMemory = 0;

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
            if ((values = lines.match(/Cached:(\s+)(\d+) kB/))) {
                cachedMemory = values[2];
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

            this.memUsage.cached = cachedMemory;
            this.menuCachedUsage.text = `${(this.memUsage.cache * 100).toFixed(0)}%`;
            this.menuCachedMaxSize.text = `${(this.memUsage.cached / KB_PER_GB).toFixed(1)} GB of ${(this.memUsage.memUsed / KB_PER_GB).toFixed(1)} GB`;
        }).catch(err => {
            console.error(`[TopHat] Error reading /proc/meminfo: ${err}`);
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
        let pointSpacing = width / (this.historyLimit - 1);
        let xStart = (this.historyLimit - this.history.length) * pointSpacing;
        let ctx = this.historyChart.get_context();
        let fg, cachedFg, bg;
        [, fg] = Clutter.Color.from_string(this.meter_fg_color);
        [, cachedFg] = Clutter.Color.from_string(this.cached_meter_fg_color);
        [, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

        Shared.setSourceColor(ctx, bg);
        ctx.rectangle(0, 0, width, height);
        ctx.fill();

        Shared.setSourceColor(ctx, fg);
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

        if (this.show_cached) {
            Shared.setSourceColor(ctx, cachedFg);
            ctx.moveTo(xStart, height);
            for (let i = 0; i < this.history.length; i++) {
                let pointHeight = Math.ceil(this.history[i].cac * height);
                let x = xStart + pointSpacing * i;
                let y = height - pointHeight;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
            ctx.closePath();
            ctx.fill();
        }
        ctx.$dispose();
    }

    destroy() {
        this._stopTimers();
        Gio.Settings.unbind(this, 'visible');
        Gio.Settings.unbind(this, 'refresh-rate');
        Gio.Settings.unbind(this.icon, 'visible');
        Gio.Settings.unbind(this, 'meter-fg-color');
        Gio.Settings.unbind(this, 'meter-bar-width');
        Gio.Settings.unbind(this, 'show-animation');
        Gio.Settings.unbind(this, 'visualization');
        Gio.Settings.unbind(this, 'show-cached');
        Gio.Settings.unbind(this, 'cached-meter-fg-color');
        super.destroy();
    }
});
