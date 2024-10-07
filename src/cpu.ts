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

import GLib from 'gi://GLib';

import { File } from './file.js';

const MAX_HISTORY = 100;

export class CpuMonitor {
  private loop = 0;
  private prevCpuState: CpuState;
  private model: CpuModel;
  private history = new Array<CpuUsage>();

  constructor(model: CpuModel) {
    this.model = model;
    this.prevCpuState = new CpuState(this.model.cores);
  }

  public start() {
    console.log(
      `[TopHat] Starting CPU monitor for ${this.model.name} w/ ${this.model.cores} logical cores`
    );
    this.loop = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () =>
      this.runLoop()
    );
  }

  public stop() {
    if (this.loop > 0) {
      GLib.source_remove(this.loop);
      this.loop = 0;
    }
  }

  private runLoop() {
    // console.log(`[TopHat] runLoop() for ${this.model.name} w/ ${this.model.cores} logical cores`);
    const f = new File('/proc/stat');
    f.read().then((contents) => {
      this.parseStat(contents);
    });
    return true;
  }

  private parseStat(stat: string) {
    const lines = stat.split('\n');
    const state = new CpuState(this.model.cores);
    const usage = new CpuUsage(this.model.cores);
    lines.forEach((line: string) => {
      if (line.startsWith('cpu')) {
        const re =
          /^cpu(\d*)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
        const m = line.match(re);
        if (m && !m[1]) {
          // These are aggregate CPU statistics
          const usedTime =
            parseInt(m[2]) +
            parseInt(m[3]) +
            parseInt(m[4]) +
            parseInt(m[6]) +
            parseInt(m[7]) +
            parseInt(m[8]) +
            parseInt(m[9]) +
            parseInt(m[10]);
          const idleTime = parseInt(m[5]);
          state.usedTime = usedTime;
          state.idleTime = idleTime;
          usage.aggregate = state.usageSince(this.prevCpuState);
          // console.log(`CPU usage: ${usage}`);
        } else if (m) {
          // These are per-core statistics
          const core = parseInt(m[1]);
          const usedTime =
            parseInt(m[2]) +
            parseInt(m[3]) +
            parseInt(m[4]) +
            parseInt(m[6]) +
            parseInt(m[7]) +
            parseInt(m[8]) +
            parseInt(m[9]) +
            parseInt(m[10]);
          const idleTime = parseInt(m[5]);
          state.coreUsedTime[core] = usedTime;
          state.coreIdleTime[core] = idleTime;
          usage.core[core] = state.coreUsageSince(this.prevCpuState, core);
        }
      }
    });
    console.log(`[TopHat] CPU: ${usage}}`);
    if (this.history.unshift(usage) > MAX_HISTORY) {
      this.history.pop();
    }
    this.prevCpuState = state;
  }
}

class CpuState {
  public usedTime: number;
  public idleTime: number;
  public coreUsedTime: Array<number>;
  public coreIdleTime: Array<number>;

  constructor(cores: number, usedTime = 0, idleTime = 0) {
    this.usedTime = usedTime;
    this.idleTime = idleTime;
    this.coreUsedTime = new Array<number>(cores);
    this.coreIdleTime = new Array<number>(cores);
    for (let i = 0; i < cores; i++) {
      this.coreUsedTime[i] = 0;
      this.coreIdleTime[i] = 0;
    }
  }

  public usageSince(prevState: CpuState) {
    const usedTimeDelta = this.usedTime - prevState.usedTime;
    const idleTimeDelta = this.idleTime - prevState.idleTime;
    const usage = usedTimeDelta / (usedTimeDelta + idleTimeDelta);
    return usage;
  }

  public coreUsageSince(prevState: CpuState, core: number) {
    const usedTimeDelta =
      this.coreUsedTime[core] - prevState.coreUsedTime[core];
    const idleTimeDelta =
      this.coreIdleTime[core] - prevState.coreIdleTime[core];
    const usage = usedTimeDelta / (usedTimeDelta + idleTimeDelta);
    return usage;
  }
}

class CpuUsage {
  public aggregate: number;
  public core: Array<number>;

  constructor(cores: number) {
    this.aggregate = 0;
    this.core = new Array<number>(cores);
    for (let i = 0; i < cores; i++) {
      this.core[i] = 0;
    }
  }

  public toString(): string {
    let s = `aggregate: ${this.aggregate.toFixed(2)}`;
    this.core.forEach((usage, index) => {
      s += ` core[${index}]: ${this.core[index].toFixed(2)}`;
    });
    return s;
  }
}

export class CpuModel {
  public name: string;
  public cores: number;

  constructor(name = 'Unknown', cores = 1) {
    this.name = name;
    this.cores = cores;
  }
}
