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

const GTop = imports.gi.GTop;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const FileModule = Me.imports.lib.file;


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
function bytesToHumanString(bytes, netUnit = 'bytes') {
    let bw = bytes;
    let unit = 'B';
    if (netUnit === 'bits') {
        bw *= 8;
        unit = 'b';
    }
    if (bw < 1) {
        return `0 K${unit}`;
    } else if (bw < 1024) {
        // Indicate activity, but don't clutter the UI w/ # of bytes
        return `< 1 K${unit}`;
    } else if (bw < ONE_MB_IN_B) {
        return `${(bw / 1024).toFixed(0)} K${unit}`;
    } else if (bw < ONE_HUNDRED_MB_IN_B) { // Show one decimal of precision for < 100 MB
        return `${(bw / ONE_MB_IN_B).toFixed(1)} M${unit}`;
    } else if (bw < ONE_GB_IN_B) {
        return `${(bw / ONE_MB_IN_B).toFixed(0)} M${unit}`;
    } else {
        return `${(bw / ONE_GB_IN_B).toFixed(1)} G${unit}`;
    }
}

function getPartitions() {
    let partitions = new Set();
    let mounts = [];
    try {
        let parts = new FileModule.File('/proc/partitions').readSync();
        parts.split('\n').forEach(part => {
            const dev = part.match(/\d+\s+([a-zA-Z]\w+)/);
            if (dev !== null && !dev[1].startsWith('loop')) {
                partitions.add(`/dev/${dev[1]}`);
            }
        });
    } catch (err) {
        log(`[${Me.metadata.name}] Error reading /proc/partitions: ${err}`);
    }
    // log(`partitions: ${Array.from(partitions)}`);
    try {
        let mountPoints = new FileModule.File('/etc/mtab').readSync();
        mountPoints.split('\n').forEach(line => {
            let cols = line.split(/\s+/);
            let device = cols[0];
            let mount = cols[1];
            // Convert back to literal spaces
            mount = mount.replaceAll('\\040', ' ');
            // log(`device: ${device} mount: ${mount}`);
            if (partitions.has(device) && !mount.startsWith('/var/snap/')) {
                mounts.push(mount);
            }
        });
    } catch (err) {
        log(`[${Me.metadata.name}] Error reading /etc/mtab: ${err}`);
    }

    return mounts;
}
