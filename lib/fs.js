'use strict';

// Copyright (C) 2022 Todd Kulesza <todd@dropline.net>

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

/* exported FileSystemMonitor */

const {Clutter, Gio, GLib, GObject, GTop, St} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const Shared = Me.imports.lib.shared;
const Monitor = Me.imports.lib.monitor;
const _ = Config.Domain.gettext;

class DiskActivity {
    constructor(read = 0, write = 0) {
        this.read = read;
        this.write = write;
    }
}

class ProcDiskActivity {
    constructor(pid = 0) {
        this.pid = pid;
        this.cmd = '';
        this.read = 0;
        this.write = 0;
        this.readPrev = 0;
        this.writePrev = 0;
        this.timePrev = 0;
    }

    updateActivity(read, write, time) {
        this.readPrev = this.read;
        this.read = read;
        this.writePrev = this.write;
        this.write = write;
        this.timePrev = this.time;
        this.time = time;
    }

    hasRecentActivity() {
        return this.timePrev > 0 &&
               ((this.write - this.writePrev) > 0 || (this.read - this.readPrev) > 0);
    }

    recentActivity() {
        return this.readRate() + this.writeRate();
    }

    readRate() {
        if (this.timePrev > 0) {
            return (this.read - this.readPrev) / ((this.time - this.timePrev) / Shared.SECOND_AS_MICROSECONDS);
        }
        return 0;
    }

    writeRate() {
        if (this.timePrev > 0) {
            return (this.write - this.writePrev) / ((this.time - this.timePrev) / Shared.SECOND_AS_MICROSECONDS);
        }
        return 0;
    }
}

class FSUsage {
    constructor(mount, size, free) {
        this.mount = mount;
        this.size = size;
        this.free = free;
    }

    used() {
        return this.size - this.free;
    }

    usage() {
        return (this.size - this.free) / this.size * 100;
    }
}

var FileSystemMonitor = GObject.registerClass({
    Properties: {
        'mount': GObject.ParamSpec.string(
            'mount',
            'Mount',
            'The mount point to monitor in the top bar',
            GObject.ParamFlags.READWRITE,
            ''
        ),
    },
}, class TopHatFileSystemMonitor extends Monitor.TopHatMonitor {
    _init(configHandler) {
        super._init(`${Me.metadata.name} FS Monitor`);

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/disk-icon-symbolic.svg`);
        this.icon = new St.Icon({gicon, style_class: 'system-status-icon tophat-panel-icon'});
        this.add_child(this.icon);

        this.usage = new St.Label({
            text: '',
            style_class: 'tophat-panel-usage',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.usage);

        this.timePrev = GLib.get_monotonic_time();
        this.diskActivityPrev = new DiskActivity();
        this.history = new Array(0);
        this.processes = new Map();
        this.refreshFSTimer = 0;
        this.refreshIOTimer = 0;

        configHandler.settings.bind('show-disk', this, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('show-icons', this.icon, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('meter-fg-color', this, 'meter-fg-color', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('meter-bar-width', this, 'meter-bar-width', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('show-animations', this, 'show-animation', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('disk-display', this, 'visualization', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('mount-to-monitor', this, 'mount', Gio.SettingsBindFlags.GET);

        let id = this.connect('notify::visible', () => {
            if (this.visible) {
                this._startTimers();
            } else {
                this._stopTimers();
            }
        });
        this._signals.push(id);

        this._buildMeter();
        this._buildMenu();
        this._startTimers();
    }

    get mount() {
        return this._mount;
    }

    set mount(value) {
        if (this._mount === value) {
            return;
        }
        this._mount = value;
        this.notify('mount');
    }

    _startTimers() {
        // Clear the history chart
        this.history = [];
        if (this.refreshFSTimer === 0) {
            this.refreshFSTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this._refreshFS());
        }
        if (this.refreshIOTimer === 0) {
            this.refreshIOTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this._refreshIO());
        }
    }

    _stopTimers() {
        if (this.refreshFSTimer !== 0) {
            GLib.source_remove(this.refreshFSTimer);
            this.refreshFSTimer = 0;
        }
        if (this.refreshIOTimer !== 0) {
            GLib.source_remove(this.refreshIOTimer);
            this.refreshIOTimer = 0;
        }
    }

    _buildMeter() {
        this.setMeter(new Monitor.Meter(1, this.meter_bar_width));
    }

    _buildMenu() {
        this.numMenuCols = 3;

        let label = new St.Label({text: _('Disk activity'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 3, 1);

        label = new St.Label({text: _('Writing:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 2, 1);
        label = new St.Label({text: _('n/a'), style_class: 'menu-value'});
        this.addMenuRow(label, 2, 1, 1);
        this.menuDiskWrites = label;

        label = new St.Label({text: _('Reading:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 2, 1);
        label = new St.Label({text: _('n/a'), style_class: 'menu-value'});
        this.addMenuRow(label, 2, 1, 1);
        this.menuDiskReads = label;

        this.historyChart = new St.DrawingArea({style_class: 'chart'});
        this.historyChart.connect('repaint', () => this._repaintHistory());
        this.addMenuRow(this.historyChart, 0, 3, 1);

        // FIXME: Don't hardcode this, base it on Config.HISTORY_MAX_SIZE
        label = new St.Label({text: _('2 mins ago'), style_class: 'chart-label-then'});
        this.addMenuRow(label, 0, 2, 1);
        label = new St.Label({text: _('now'), style_class: 'chart-label-now'});
        this.addMenuRow(label, 2, 1, 1);

        label = new St.Label({text: _('Top processes'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 3, 1);

        label = new St.Label({text: ''});
        this.addMenuRow(label, 0, 1, 1);

        label = new St.Label({text: _('Writing'), style_class: 'menu-subheader'});
        this.addMenuRow(label, 1, 1, 1);
        label = new St.Label({text: _('Reading'), style_class: 'menu-subheader'});
        this.addMenuRow(label, 2, 1, 1);

        this.topProcesses = [];
        for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
            let cmd = new St.Label({text: '', style_class: 'menu-cmd-name'});
            this.addMenuRow(cmd, 0, 1, 1);
            let usage = [];
            usage.push(new St.Label({text: '', style_class: 'menu-disk-activity'}));
            usage.push(new St.Label({text: '', style_class: 'menu-disk-activity'}));
            this.addMenuRow(usage[0], 1, 1, 1);
            this.addMenuRow(usage[1], 2, 1, 1);
            let p = new Shared.TopProcess(cmd, usage);
            this.topProcesses.push(p);
        }

        label = new St.Label({text: _('Filesystem usage'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 3, 1);

        let grid = new St.Widget({
            layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        });
        this.menuFSDetails = grid.layout_manager;
        this.addMenuRow(grid, 0, 3, 1);

        this.buildMenuButtons();
    }

    refresh() {
        this._refreshFS();
        this._refreshIO();
    }

    _refreshFS() {
        let mounts = Shared.getPartitions();
        let row = 0;
        let fsDetails = new Map();
        mounts.forEach(mountPath => {
            let fsu = new GTop.glibtop_fsusage();
            GTop.glibtop_get_fsusage(fsu, mountPath);
            let fs = new FSUsage(mountPath, fsu.blocks * fsu.block_size, fsu.bfree * fsu.block_size);

            // Remove existing rows
            let label = this.menuFSDetails.get_child_at(0, row);
            if (label !== null) {
                label.destroy();
            }
            label = this.menuFSDetails.get_child_at(1, row);
            if (label !== null) {
                label.destroy();
            }
            label = this.menuFSDetails.get_child_at(0, row + 1);
            if (label !== null) {
                label.destroy();
            }

            // Create a row for each mount point with it's % usage
            label = new St.Label({text: mountPath, style_class: 'menu-label'});
            this.menuFSDetails.attach(label, 0, row, 1, 1);
            label = new St.Label({
                text: `${fs.usage().toFixed(0)}%`,
                style_class: 'menu-value',
                x_expand: true,
            });
            this.menuFSDetails.attach(label, 1, row, 1, 1);
            row++;

            // Create a row showing free space and total disk size in absolute units
            label = new St.Label({text: `${Shared.bytesToHumanString(fs.free)} available of ${Shared.bytesToHumanString(fs.size)}`, style_class: 'menu-value menu-details menu-section-end'});
            this.menuFSDetails.attach(label, 0, row, 2, 1);
            row++;

            fsDetails.set(mountPath, fs);
        });

        // Remove old menu rows, if any
        let label = this.menuFSDetails.get_child_at(0, row);
        while (label !== null) {
            label.destroy();
            label = this.menuFSDetails.get_child_at(1, row);
            if (label !== null) {
                label.destroy();
            }
            row++;
            label = this.menuFSDetails.get_child_at(0, row);
        }

        // Update the top bar meter
        if (!this.mount) {
            if (fsDetails.has('/home')) {
                this.mount = '/home';
            } else {
                this.mount = '/';
            }
        }
        let fs = fsDetails.get(this.mount);
        if (fs) {
            this.meter.setUsage([fs.usage()]);
            this.usage.text = `${fs.usage().toFixed(0)}%`;
        }

        return true;
    }

    _refreshIO() {
        let processes = Shared.getProcessList();
        let updatedProcesses = new Map();
        let read = 0, write = 0;
        let time = GLib.get_monotonic_time();
        processes.forEach(pid => {
            let procInfo = this.processes.get(pid);
            if (procInfo === undefined) {
                procInfo = new ProcDiskActivity(pid);
                procInfo.cmd = Shared.getProcessName(pid);
            }

            if (procInfo.cmd) {
                let io = new GTop.glibtop_proc_io();
                GTop.glibtop_get_proc_io(io, pid);
                if (io.disk_rbytes === 0 && io.disk_wbytes === 0) {
                    return;
                }
                procInfo.updateActivity(io.disk_rbytes, io.disk_wbytes, time);
                read += procInfo.readRate();
                write += procInfo.writeRate();
                updatedProcesses.set(pid, procInfo);
            }
        });
        this.processes = updatedProcesses;

        // Get the top processes by disk activity
        let procList = new Array(0);
        this.processes.forEach(e => {
            if (e.hasRecentActivity()) {
                procList.push(e);
            }
        });
        procList.sort((a, b) => {
            return b.recentActivity() - a.recentActivity();
        });
        procList = procList.slice(0, Config.N_TOP_PROCESSES);
        while (procList.length < Config.N_TOP_PROCESSES) {
            // If we don't have at least N_TOP_PROCESSES active, fill out
            // the array with empty ones
            procList.push(new ProcDiskActivity());
        }
        for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
            this.topProcesses[i].cmd.text = procList[i].cmd;
            let readActivity = '', writeActivity = '';
            if (procList[i].cmd) {
                readActivity = `${Shared.bytesToHumanString(procList[i].readRate())}/s`;
                writeActivity = `${Shared.bytesToHumanString(procList[i].writeRate())}/s`;
            }
            this.topProcesses[i].usage[0].text = writeActivity;
            this.topProcesses[i].usage[1].text = readActivity;
        }

        let diskRead = Shared.bytesToHumanString(Math.round(read));
        let diskWrite = Shared.bytesToHumanString(Math.round(write));
        this.menuDiskReads.text = `${diskRead}/s`;
        this.menuDiskWrites.text = `${diskWrite}/s`;

        while (this.history.length >= Config.HISTORY_MAX_SIZE) {
            this.history.shift();
        }
        this.history.push(new DiskActivity(
            Math.round(read),
            Math.round(write))
        );
        this.historyChart.queue_repaint();

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

        // Use a small value to avoid max == 0
        let max = 0.001;
        for (const da of this.history) {
            if (da.read > max) {
                max = da.read;
            }
            if (da.write > max) {
                max = da.write;
            }
        }
        max *= 2; // leave room for both upload and download speeds on the same chart

        Clutter.cairo_set_source_color(ctx, bg);
        ctx.rectangle(0, 0, width, height);
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fg);
        ctx.moveTo(xStart, height);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].read / max * height);
            let x = xStart + pointSpacing * i;
            let y = height - pointHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
        ctx.closePath();
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fg);
        ctx.moveTo(xStart, 0);
        for (let i = 0; i < this.history.length; i++) {
            let pointHeight = Math.ceil(this.history[i].write / max * height);
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
        this._stopTimers();
        Gio.Settings.unbind(this, 'visible');
        Gio.Settings.unbind(this.icon, 'visible');
        Gio.Settings.unbind(this, 'meter-fg-color');
        Gio.Settings.unbind(this, 'meter-bar-width');
        Gio.Settings.unbind(this, 'mount');
        Gio.Settings.unbind(this, 'show-animation');
        super.destroy();
    }
});
