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
import GLib from 'gi://GLib';

export enum DisplayType {
  Chart,
  Numeric,
  Both,
}

const ONE_MB_IN_B = 1000000;
const TEN_MB_IN_B = 10000000;
export const ONE_GB_IN_B = 1000000000;
const TEN_GB_IN_B = 10000000000;
const ONE_TB_IN_B = 1000000000000;
const TEN_TB_IN_B = 10000000000000;

const MOUNTS_PATH = '/proc/self/mounts';
const DEVICE_PREFIX = '/dev/';
const RE_MOUNT_ESCAPE = /\\([0-7]{3})/g;
const FS_SIZE = 'filesystem::size';
const FS_USED = 'filesystem::used';

export function GBytesToHumanString(gb: number): string {
  return bytesToHumanString(gb * ONE_GB_IN_B);
}

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'query_filesystem_info_async');

/**
 * Convert a number of bytes to a more logical human-readable string (e.g., 1024 -> 1 K).
 *
 * @param {number} bytes - Number of bytes to convert
 * @param {string} [unit='bytes']  - Either bytes or bits
 * @param {boolean} [imprecise=false] - Reduce precision to 0
 */
export function bytesToHumanString(
  bytes: number,
  unit: string = 'bytes',
  imprecise: boolean = false
): string {
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
  } else if (quantity < TEN_MB_IN_B) {
    // Show one decimal of precision for < 100 MB
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
 * @param {number} bytes - Value of bytes to round
 */
export function roundMax(bytes: number) {
  let result = Math.pow(10, Math.ceil(Math.log10(bytes)));
  while (result / 2 > bytes && result > 20000) {
    result /= 2;
  }
  return result;
}

export function getDisplayTypeSetting(settings: Gio.Settings, key: string) {
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
  public dev;
  public cap;
  public used;
  public mount;

  constructor(dev = '', cap = 0, used = 0, mount = '') {
    this.dev = dev;
    this.cap = cap;
    this.used = used;
    this.mount = mount;
  }

  public usage() {
    return Math.round((this.used / this.cap) * 100);
  }
}

interface DeviceMount {
  dev: string;
  mount: string;
}

function unescapeMountPath(path: string): string {
  return path.replace(RE_MOUNT_ESCAPE, (_, octal: string) =>
    String.fromCharCode(parseInt(octal, 8))
  );
}

export function parseDeviceMounts(mountsText: string): DeviceMount[] {
  const mounts: DeviceMount[] = [];
  for (const line of mountsText.split('\n')) {
    const [source, target] = line.split(' ');
    if (source?.startsWith(DEVICE_PREFIX) && target) {
      mounts.push({
        dev: source.slice(DEVICE_PREFIX.length),
        mount: unescapeMountPath(target),
      });
    }
  }
  return mounts;
}

async function readMountUsage({ dev, mount }: DeviceMount): Promise<FSUsage> {
  const info = await Gio.File.new_for_path(mount).query_filesystem_info_async(
    `${FS_SIZE},${FS_USED}`,
    GLib.PRIORITY_LOW,
    null
  );
  return new FSUsage(
    dev,
    info.get_attribute_uint64(FS_SIZE),
    info.get_attribute_uint64(FS_USED),
    mount
  );
}

function shortestMountPerDevice(fileSystems: FSUsage[]): FSUsage[] {
  const byDevice = new Map<string, FSUsage>();
  for (const fileSystem of fileSystems) {
    const existing = byDevice.get(fileSystem.dev);
    if (!existing || fileSystem.mount.length < existing.mount.length) {
      byDevice.set(fileSystem.dev, fileSystem);
    }
  }
  return Array.from(byDevice.values());
}

export async function readFileSystems(): Promise<FSUsage[]> {
  try {
    const [contents] =
      await Gio.File.new_for_path(MOUNTS_PATH).load_contents_async(null);
    const mounts = parseDeviceMounts(new TextDecoder().decode(contents));
    const results = await Promise.allSettled(mounts.map(readMountUsage));
    const readable = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);
    return shortestMountPerDevice(readable);
  } catch (e) {
    console.warn(`[TopHat] Could not read file systems: ${e}`);
    throw e;
  }
}
