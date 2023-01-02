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
/* exported getProcessList, getProcessName, bytesToHumanString */

const GTop = imports.gi.GTop;

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
