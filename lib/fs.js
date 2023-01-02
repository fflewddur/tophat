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
const FileModule = Me.imports.lib.file;
const _ = Config.Domain.gettext;

const BYTES_PER_GB = 1000000000;

class DiskActivity {
    constructor(read = 0, write = 0) {
        this.read = read;
        this.write = write;
    }
}

var FileSystemMonitor = GObject.registerClass(
class TopHatFileSystemMonitor extends Monitor.TopHatMonitor {
    _init(configHandler) {
        super._init(`${Me.metadata.name} FS Monitor`);

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/disk-icon.svg`);
        let icon = new St.Icon({gicon, style_class: 'system-status-icon tophat-panel-icon'});
        this.add_child(icon);

        this.timePrev = GLib.get_monotonic_time();
        this.diskActivityPrev = new DiskActivity();
        this.history = new Array(0);

        configHandler.settings.bind('show-disk', this, 'visible', Gio.SettingsBindFlags.GET);

        this._buildMenu();
        this._readFSInfo();

        this.refreshFSTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this._readFSInfo());
    }

    _buildMenu() {
        let label = new St.Label({text: _('Disk activity'), style_class: 'menu-header'});
        this.addMenuRow(label, 0, 2, 1);

        label = new St.Label({text: _('Data read:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 1, 1);
        label = new St.Label({text: _('n/a'), style_class: 'menu-value'});
        this.addMenuRow(label, 1, 1, 1);
        this.menuDiskReads = label;

        label = new St.Label({text: _('Data written:'), style_class: 'menu-label'});
        this.addMenuRow(label, 0, 1, 1);
        label = new St.Label({text: _('n/a'), style_class: 'menu-value'});
        this.addMenuRow(label, 1, 1, 1);
        this.menuDiskWrites = label;

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
        new FileModule.File('/proc/partitions').read().then(parts => {
            let partitions = new Set();
            parts.split('\n').forEach(part => {
                const dev = part.match(/\d+\s+([a-zA-Z]\w+)/);
                if (dev !== null && !dev[1].startsWith('loop')) {
                    partitions.add(`/dev/${dev[1]}`);
                }
            });
            // log(`partitions: ${Array.from(partitions)}`);

            let mounts = new Set();
            new FileModule.File('/etc/mtab').read().then(mountPoints => {
                mountPoints.split('\n').forEach(line => {
                    let cols = line.split(/\s+/);
                    let device = cols[0];
                    let mount = cols[1];
                    // Convert back to literal spaces
                    mount = mount.replaceAll('\\040', ' ');
                    // log(`device: ${device} mount: ${mount}`);
                    if (partitions.has(device) && !mount.startsWith('/var/snap/')) {
                        mounts.add(mount);
                        // log(`FOUND PARTITION: ${device}`);
                    }
                });
                // log(`mounts: ${Array.from(mounts)}`);

                let row = 0, read = 0, write = 0;
                let time = GLib.get_monotonic_time();
                mounts.forEach(mount => {
                    let fsu = new GTop.glibtop_fsusage();
                    GTop.glibtop_get_fsusage(fsu, mount);
                    let size = fsu.blocks * fsu.block_size / BYTES_PER_GB;
                    let used = (fsu.blocks - fsu.bfree) * fsu.block_size / BYTES_PER_GB;
                    read += fsu.read;
                    write += fsu.write;

                    let label = this.menuFSDetails.get_child_at(0, row);
                    if (label !== null) {
                        label.destroy();
                    }
                    label = this.menuFSDetails.get_child_at(1, row);
                    if (label !== null) {
                        label.destroy();
                    }
                    label = new St.Label({text: mount, style_class: 'menu-label'});
                    this.menuFSDetails.attach(label, 0, row, 1, 1);
                    label = new St.Label({
                        text: `${(used / size * 100).toFixed(0)}%`,
                        style_class: 'menu-value',
                        x_expand: true,
                    });
                    this.menuFSDetails.attach(label, 1, row, 1, 1);
                    row++;
                    // log(`${mount} size=${size.toFixed(1)} GB used=${used.toFixed(1)} GB read=${fsu.read} write=${fsu.write}`);
                });
                // Remove rows for recently unmounted drives
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
            });
        });
        return true;
    }

    destroy() {
        if (this.refreshFSTimer !== 0) {
            GLib.source_remove(this.refreshFSTimer);
            this.refreshFSTimer = 0;
        }
        super.destroy();
    }
});
