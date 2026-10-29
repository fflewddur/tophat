// Copyright (C) 2024 Todd Kulesza <todd@dropline.net>
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
export var DisplayType;
(function (DisplayType) {
    DisplayType[DisplayType["Chart"] = 0] = "Chart";
    DisplayType[DisplayType["Numeric"] = 1] = "Numeric";
    DisplayType[DisplayType["Both"] = 2] = "Both";
})(DisplayType || (DisplayType = {}));
const ONE_MB_IN_B = 1000000;
const TEN_MB_IN_B = 10000000;
export const ONE_GB_IN_B = 1000000000;
const TEN_GB_IN_B = 10000000000;
const ONE_TB_IN_B = 1000000000000;
const TEN_TB_IN_B = 10000000000000;
const RE_DF_IS_DISK = /^\s*\/dev\/(\S+)(.*)$/;
const RE_DF_DISK_USAGE = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+%)\s+(.*)$/;
export function GBytesToHumanString(gb) {
    return bytesToHumanString(gb * ONE_GB_IN_B);
}
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
/**
 * Convert a number of bytes to a more logical human-readable string (e.g., 1024 -> 1 K).
 *
 * @param {number} bytes - Number of bytes to convert
 * @param {string} [unit='bytes']  - Either bytes or bits
 * @param {boolean} [imprecise=false] - Reduce precision to 0
 */
export function bytesToHumanString(bytes, unit = 'bytes', imprecise = false) {
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
    }
    else if (quantity < 1000) {
        // Indicate activity, but don't clutter the UI w/ # of bytes
        return `< 1 K${suffix}`;
    }
    else if (quantity < ONE_MB_IN_B) {
        return `${(quantity / 1000).toFixed(0)} K${suffix}`;
    }
    else if (quantity < TEN_MB_IN_B) {
        // Show one decimal of precision for < 100 MB
        return `${(quantity / ONE_MB_IN_B).toFixed(precision)} M${suffix}`;
    }
    else if (quantity < ONE_GB_IN_B) {
        return `${(quantity / ONE_MB_IN_B).toFixed(0)} M${suffix}`;
    }
    else if (quantity < TEN_GB_IN_B) {
        return `${(quantity / ONE_GB_IN_B).toFixed(precision)} G${suffix}`;
    }
    else if (quantity < ONE_TB_IN_B) {
        return `${(quantity / ONE_GB_IN_B).toFixed(0)} G${suffix}`;
    }
    else if (quantity < TEN_TB_IN_B) {
        return `${(quantity / ONE_TB_IN_B).toFixed(precision)} T${suffix}`;
    }
    else {
        return `${(quantity / ONE_TB_IN_B).toFixed(0)} T${suffix}`;
    }
}
/**
 * Round up to the nearest power of 10 (or half that).
 *
 * @param {number} bytes - Value of bytes to round
 */
export function roundMax(bytes) {
    let result = Math.pow(10, Math.ceil(Math.log10(bytes)));
    while (result / 2 > bytes && result > 20000) {
        result /= 2;
    }
    return result;
}
export function getDisplayTypeSetting(settings, key) {
    let t = DisplayType.Both;
    switch (settings.get_string(key)) {
        case 'chart':
            t = DisplayType.Chart;
            break;
        case 'numeric':
            t = DisplayType.Numeric;
            break;
        case 'both':
            t = DisplayType.Both;
            break;
    }
    return t;
}
export class FSUsage {
    dev;
    cap;
    used;
    mount;
    constructor(dev = '', cap = 0, used = 0, mount = '') {
        this.dev = dev;
        this.cap = cap;
        this.used = used;
        this.mount = mount;
    }
    usage() {
        return Math.round((this.used / this.cap) * 100);
    }
}
export async function readFileSystems() {
    return new Promise((resolve, reject) => {
        const fileSystems = new Map();
        try {
            const proc = Gio.Subprocess.new(['df', '-P'], Gio.SubprocessFlags.STDOUT_PIPE);
            proc.communicate_utf8_async(null, null).then(([stdout]) => {
                // Try to process the output even if the exit status != 0
                if (stdout) {
                    const output = stdout;
                    const lines = output.split('\n');
                    for (const line of lines) {
                        const m = line.match(RE_DF_IS_DISK);
                        if (m) {
                            const details = m[2].match(RE_DF_DISK_USAGE);
                            if (details) {
                                const dev = m[1];
                                const cap = parseInt(details[1]) * 1024;
                                const used = parseInt(details[2]) * 1024;
                                const mount = details[5];
                                let fileSystem = new FSUsage(dev, cap, used, mount);
                                if (fileSystems.has(dev)) {
                                    const old = fileSystems.get(dev);
                                    if (old && old.mount.length < mount.length) {
                                        // Only report one mount per device; use the shortest file path
                                        fileSystem = old;
                                    }
                                }
                                fileSystems.set(dev, fileSystem);
                            }
                        }
                    }
                    resolve(Array.from(fileSystems.values()));
                    return;
                }
                else {
                    console.warn('[TopHat] Could not run df -P: ');
                    reject('Could not run df -P');
                    return;
                }
            });
        }
        catch (e) {
            console.warn('[TopHat] Could not run df -P: ' + e);
            reject('Could not run df -P');
            return;
        }
    });
}
