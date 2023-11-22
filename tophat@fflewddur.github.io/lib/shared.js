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

import Gio from 'gi://Gio';
import GTop from 'gi://GTop';

export const SECOND_AS_MICROSECONDS = 1000000;
export const SECOND_AS_MILLISECONDS = 1000;

export class TopProcess {
    constructor(cmd, usage) {
        this.cmd = cmd;
        this.usage = usage;
    }
}

/**
 * Return an array of active processes.
 */
export function getProcessList() {
    let extraInfo = new GTop.glibtop_proclist();
    let exclude = 0;
    let processes = GTop.glibtop_get_proclist(
        extraInfo, GTop.GLIBTOP_KERN_PROC_ALL, exclude
    );
    if (extraInfo.number > 0) {
        return processes.slice(0, extraInfo.number);
    } else {
        return [];
    }
}

/**
 * Get the name of a given process.
 *
 * @param {*} pid - Process ID
 * @returns {string} - Name of the process
 */
export function getProcessName(pid) {
    let argSize = new GTop.glibtop_proc_args();
    let args = GTop.glibtop_get_proc_args(argSize, pid, 0);

    let cmd = '';
    if (args) {
        let lastSeparator = args.lastIndexOf('/');
        cmd = args;
        if (lastSeparator >= 0) {
            cmd = cmd.slice(lastSeparator + 1);
        }
    }

    // If cmd args are empty, try fetching cmd from proc_state
    if (cmd === '') {
        let procState = new GTop.glibtop_proc_state();
        GTop.glibtop_get_proc_state(procState, pid);
        if (procState && procState.cmd) {
            let chars = [];
            for (let i = 0; i < procState.cmd.length && procState.cmd[i] !== 0; i++) {
                chars.push(procState.cmd[i]);
            }
            let str = String.fromCharCode(...chars);
            if (str !== '') {
                cmd = `[${str}]`;
            }
        }
    }
    // if (cmd === '') {
    //     console.debug(`Still no cmd for pid ${pid}`);
    // }
    // TODO: return both shortened cmd (for menu display) and full cmd (for tooltips)
    cmd = cmd.slice(0, 35);
    return cmd;
}

const ONE_MB_IN_B = 1000000;
const TEN_MB_IN_B = 10000000;
const ONE_GB_IN_B = 1000000000;
const TEN_GB_IN_B = 10000000000;
const ONE_TB_IN_B = 1000000000000;
const TEN_TB_IN_B = 10000000000000;

/**
 * Convert a number of bytes to a more logical human-readable string (e.g., 1024 -> 1 K).
 *
 * @param {number} bytes - Number of bytes to convert
 * @param {string} [unit='bytes']  - Either bytes or bits
 * @param {boolean} [imprecise=false] - Reduce precision to 0
 */
export function bytesToHumanString(bytes, unit = 'bytes', imprecise = false) {
    if (isNaN(bytes)) {
        return bytes;
    }
    let quantity = bytes;
    let precision = 1;
    if (imprecise) {
        precision = 0;
    }
    let suffix = 'B';
    if (unit === 'bits') {
        quantity *= 8;
        suffix = 'b';
    }
    if (quantity < 1) {
        return `0 K${suffix}`;
    } else if (quantity < 1000) {
        // Indicate activity, but don't clutter the UI w/ # of bytes
        return `< 1 K${suffix}`;
    } else if (quantity < ONE_MB_IN_B) {
        return `${(quantity / 1000).toFixed(0)} K${suffix}`;
    } else if (quantity < TEN_MB_IN_B) { // Show one decimal of precision for < 100 MB
        return `${(quantity / ONE_MB_IN_B).toFixed(precision)} M${suffix}`;
    } else if (quantity < ONE_GB_IN_B) {
        return `${(quantity / ONE_MB_IN_B).toFixed(0)} M${suffix}`;
    } else if (quantity < TEN_GB_IN_B) {
        return `${(quantity / ONE_GB_IN_B).toFixed(precision)} G${suffix}`;
    } else if (quantity < ONE_TB_IN_B) {
        return `${(quantity / ONE_GB_IN_B).toFixed(0)} G${suffix}`;
    } else if (quantity < TEN_TB_IN_B) {
        return `${(quantity / ONE_TB_IN_B).toFixed(precision)} T${suffix}`;
    } else {
        return `${(quantity / ONE_TB_IN_B).toFixed(0)} T${suffix}`;
    }
}

/**
 * Round up to the nearest power of 10 (or half that).
 *
 * @param {number} val - Value to round
 */
export function roundMax(val) {
    let result = Math.pow(10, Math.ceil(Math.log10(val)));
    if (result / 2 > val) {
        result /= 2;
    }
    return result;
}

/**
 * Returns an array of disk partition mount points.
 */
export function getPartitions() {
    let mounts = [];
    let mountPoints = Gio.unix_mount_points_get();
    if (!mountPoints || !mountPoints[0]) {
        console.warn('[TopHat] Gio.unix_mount_points_get() returned an empty result');
        return [];
    }

    let mountMap = new Map();
    mountPoints[0].forEach(entry => {
        let devPath = entry.get_device_path();
        let mountPath = entry.get_mount_path();
        if (!entry.is_loopback()) {
            // Only show each physical disk partition once
            // If a partition has sub-volumes, use the one with the shortest path (e.g., /) as the label
            let shortestPath = mountMap.get(devPath);
            if ((shortestPath === undefined) || mountPath.length < shortestPath.length) {
                let mountEntry = Gio.unix_mount_at(mountPath);
                if (mountEntry && mountEntry[0]) {
                    mountMap.set(devPath, mountPath);
                }
            }
        }
    });
    mounts = Array.from(mountMap.values());
    // console.debug(`[TopHat] mounts = ${mounts}`);
    return mounts;
}
