// TopHat: An elegant system resource monitor for the GNOME shell
// Copyright (C) 2020 Todd Kulesza <todd@dropline.net>

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
import {
  Extension,
  ExtensionMetadata,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { CpuMonitor, CpuModel } from './cpu.js';
import { File } from './file.js';
import { Vitals } from './vitals.js';

export default class TopHat extends Extension {
  private loop = 0;
  private vitals: Vitals;
  private cpu: CpuMonitor;

  constructor(metadata: ExtensionMetadata) {
    super(metadata);

    this.vitals = new Vitals();

    const f = new File('/proc/cpuinfo');
    const cpuModel = this.parseCpuOverview(f.readSync());

    this.cpu = new CpuMonitor(cpuModel);
  }

  public enable() {
    console.log(`[TopHat] enabling version ${this.metadata.version}`);
    this.cpu.start();
    if (this.loop === 0) {
      this.loop = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () =>
        this.readVitals()
      );
    }
    console.log('[TopHat] enabled');
  }

  public disable() {
    console.log(`[TopHat] disabling version ${this.metadata.version}`);
    this.cpu.stop();
    if (this.loop > 0) {
      GLib.source_remove(this.loop);
      this.loop = 0;
    }
    console.log('[TopHat] disabled');
  }

  private parseCpuOverview(cpuinfo: string): CpuModel {
    const lines = cpuinfo.split('\n');
    const modelRE = /^model name\s*:\s*(.*)$/;
    const coreRE = /^processor\s*:\s*(\d+)$/;

    let model = '';
    let cores = 0;

    lines.forEach((line) => {
      let m = !model && line.match(modelRE);
      if (m) {
        model = m[1];
      }
      m = line.match(coreRE);
      if (m) {
        cores++;
      }
    });

    return new CpuModel(model, cores);
  }

  private readVitals(): boolean {
    this.vitals.read();
    return true;
  }
}
