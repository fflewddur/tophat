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

/* exported SECOND_AS_MICROSECONDS, SECOND_AS_MILLISECONDS, TopProcess */
/* exported getProcessList, getProcessName, bytesToHumanString, getPartitions */

const {Gio, GTop} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var SECOND_AS_MICROSECONDS = 1000000;
var SECOND_AS_MILLISECONDS = 1000;

var TopProcess = class TopProcess {
    constructor(cmd, usage) {
        this.cmd = cmd;
        this.usage = usage;
    }
};

function getProcessList() {
    let extraInfo = new GTop.glibtop_proclist();
    let exclude = 0;
    var processes = GTop.glibtop_get_proclist(
        extraInfo, GTop.GLIBTOP_KERN_PROC_ALL, exclude
    );
    return processes;
}

function getProcessName(pid) {
    let argSize = new GTop.glibtop_proc_args();
    let args = GTop.glibtop_get_proc_args(argSize, pid, 0);

    var cmd = '';
    if (args) {
        let lastSeparator = args.lastIndexOf('/');
        cmd = args;
        if (lastSeparator >= 0) {
            cmd = cmd.slice(lastSeparator + 1);
        }
        cmd = cmd.slice(0, 35);
    }

    return cmd;
}

const ONE_MB_IN_B = 1048576;
const ONE_HUNDRED_MB_IN_B = 104857600;
const ONE_GB_IN_B = 1073741824;

// Convert a number of bytes to a more logical human-readable string
// (e.g., 1024 -> 1 K)
function bytesToHumanString(bytes, unit = 'bytes') {
    if (isNaN(bytes)) {
        return bytes;
    }
    let bw = bytes;
    let suffix = 'B';
    if (unit === 'bits') {
        bw *= 8;
        suffix = 'b';
    }
    if (bw < 1) {
        return `0 K${suffix}`;
    } else if (bw < 1024) {
        // Indicate activity, but don't clutter the UI w/ # of bytes
        return `< 1 K${suffix}`;
    } else if (bw < ONE_MB_IN_B) {
        return `${(bw / 1024).toFixed(0)} K${suffix}`;
    } else if (bw < ONE_HUNDRED_MB_IN_B) { // Show one decimal of precision for < 100 MB
        return `${(bw / ONE_MB_IN_B).toFixed(1)} M${suffix}`;
    } else if (bw < ONE_GB_IN_B) {
        return `${(bw / ONE_MB_IN_B).toFixed(0)} M${suffix}`;
    } else {
        return `${(bw / ONE_GB_IN_B).toFixed(1)} G${suffix}`;
    }
}

// Returns an array of disk partition mount points
function getPartitions() {
    // Gio.unix_mounts_get() appears to return a boxed GList instead of a
    // JS array, hence the weirdness.
    let mountEntries = Gio.unix_mounts_get();
    if (!mountEntries || !mountEntries[0]) {
        log(`[${Me.metadata.name}] Gio.unix_mounts_get() returned an empty result`);
        return [];
    }

    let mounts = [];
    mountEntries[0].forEach(entry => {
        let mountPath = Gio.unix_mount_get_mount_path(entry);
        let devicePath = Gio.unix_mount_get_device_path(entry);
        let isDev = devicePath.startsWith('/dev/');
        let isLoop = devicePath.match(/^\/dev\/loop[\d+]/);
        let isSnap = mountPath.match(/^\/var\/snap\//);
        if (!isDev || isLoop || isSnap) {
            return;
        }
        mounts.push(mountPath);
    });

    // TODO: experiment with mount points instead of mount entries; may fix issues with btrfs subvolumes
    // let mountPoints = Gio.unix_mount_points_get();
    // if (!mountPoints || !mountPoints[0]) {
    //     log(`[${Me.metadata.name}] Gio.unix_mount_points_get() returned an empty result`);
    //     return [];
    // }

    // mountPoints[0].forEach(entry => {
    //     log(`entry: ${entry} path: ${entry.get_device_path()} name: ${entry.guess_name()}`);
    // });

    return mounts;
}
