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

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/disk-icon.svg`);
        let icon = new St.Icon({gicon, style_class: 'system-status-icon tophat-panel-icon'});
        this.add_child(icon);

        this.timePrev = GLib.get_monotonic_time();
        this.diskActivityPrev = new DiskActivity();
        this.history = new Array(0);

        configHandler.settings.bind('show-disk', this, 'visible', Gio.SettingsBindFlags.GET);
        configHandler.settings.bind('show-icons', icon, 'visible', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('meter-fg-color', this, 'meter-fg-color', Gio.SettingsBindFlags.DEFAULT);
        configHandler.settings.bind('meter-bar-width', this, 'meter-bar-width', Gio.SettingsBindFlags.DEFAULT);
        configHandler.connect_boolean('show-animations', this, 'show-animation');
        configHandler.settings.bind('mount-to-monitor', this, 'mount', Gio.SettingsBindFlags.DEFAULT);

        this._buildMeter();
        this._buildMenu();

        this.refreshFSTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this._readFSInfo());
        this.refreshIOTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this.refreshIO());
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

    _buildMeter() {
        this.setMeter(new Monitor.Meter(1, this.meter_bar_width));
    }

    _buildMenu() {
        let label = new St.Label({text: _('Disk activity'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 2, 1);

        label = new St.Label({text: _('Reading:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 1, 1);
        label = new St.Label({text: _('n/a'), style_class: 'menu-value'});
        this.addMenuRow(label, 1, 1, 1);
        this.menuDiskReads = label;

        label = new St.Label({text: _('Writing:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 1, 1);
        label = new St.Label({text: _('n/a'), style_class: 'menu-value'});
        this.addMenuRow(label, 1, 1, 1);
        this.menuDiskWrites = label;

        this.historyChart = new St.DrawingArea({style_class: 'chart'});
        this.historyChart.connect('repaint', () => this.repaintHistory());
        this.addMenuRow(this.historyChart, 0, 2, 1);

        // FIXME: Don't hardcode this, base it on Config.HISTORY_MAX_SIZE
        label = new St.Label({text: _('2 mins ago'), style_class: 'chart-label-then'});
        this.addMenuRow(label, 0, 1, 1);
        label = new St.Label({text: _('now'), style_class: 'chart-label-now'});
        this.addMenuRow(label, 1, 1, 1);

        label = new St.Label({text: _('Filesystem usage'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 2, 1);

        let grid = new St.Widget({
            layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        });
        this.menuFSDetails = grid.layout_manager;
        this.addMenuRow(grid, 0, 2, 1);

        this.buildMenuButtons();
    }

    _readFSInfo() {
        // TODO: use a set to store the mountPaths we'll monitor and use Gio.UnixMountMonitor to listen for changes to mount points. when there's a change, clear the set and call unix_mounts_get() again. when refreshing status, just use the set instead of calling unix_mounts_get().
        let mounts = Shared.getPartitions();
        let row = 0, read = 0, write = 0;
        let fsDetails = new Map();
        let time = GLib.get_monotonic_time();
        mounts.forEach(mountPath => {
            let fsu = new GTop.glibtop_fsusage();
            GTop.glibtop_get_fsusage(fsu, mountPath);
            let fs = new FSUsage(mountPath, fsu.blocks * fsu.block_size, fsu.bfree * fsu.block_size);
            read += fsu.read;
            write += fsu.write;

            // Create a menu row for each filesystem
            let label = this.menuFSDetails.get_child_at(0, row);
            if (label !== null) {
                label.destroy();
            }
            label = this.menuFSDetails.get_child_at(1, row);
            if (label !== null) {
                label.destroy();
            }
            label = new St.Label({text: mountPath, style_class: 'menu-label'});
            this.menuFSDetails.attach(label, 0, row, 1, 1);
            label = new St.Label({
                text: `${fs.usage().toFixed(0)}%`,
                style_class: 'menu-value',
                x_expand: true,
            });
            this.menuFSDetails.attach(label, 1, row, 1, 1);
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
        }

        // Update the disk activity menu section
        let readDelta = read - this.diskActivityPrev.read;
        let writeDelta = write - this.diskActivityPrev.write;
        let timeDelta = (time - this.timePrev) / Shared.SECOND_AS_MICROSECONDS;
        this.diskActivityPrev.read = read;
        this.diskActivityPrev.write = write;
        this.timePrev = time;
        let diskRead = Shared.bytesToHumanString(Math.round(readDelta / timeDelta));
        let diskWrite = Shared.bytesToHumanString(Math.round(writeDelta / timeDelta));
        this.menuDiskReads.text = `${diskRead}/s`;
        this.menuDiskWrites.text = `${diskWrite}/s`;
        // log(`Disk activity: read=${readDelta} B (${diskRead}/s) write=${writeDelta} B (${diskWrite}/s)`);

        while (this.history.length >= Config.HISTORY_MAX_SIZE) {
            this.history.shift();
        }
        this.history.push(new DiskActivity(
            Math.round(readDelta / timeDelta),
            Math.round(writeDelta / timeDelta))
        );
        this.historyChart.queue_repaint();

        return true;
    }

    refreshIO() {
        let processes = Shared.getProcessList();
        processes.forEach(pid => {
            let io = new GTop.glibtop_proc_io();
            GTop.glibtop_get_proc_io(io, pid);
            // log(`pid=${pid} disk_rbytes=${io.disk_rbytes}`);
        });
    }

    repaintHistory() {
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
        if (this.refreshFSTimer !== 0) {
            GLib.source_remove(this.refreshFSTimer);
            this.refreshFSTimer = 0;
        }
        if (this.refreshIOTimer !== 0) {
            GLib.source_remove(this.refreshIOTimer);
            this.refreshIOTimer = 0;
        }
        super.destroy();
    }
});
