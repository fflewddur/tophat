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
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// import { CpuMonitor } from './cpu.js';
import { File } from './file.js';
import { Vitals, CpuModel } from './vitals.js';
import { TopHatContainer } from './container.js';
import { TopHatMeter } from './meter.js';

export default class TopHat extends Extension {
  private loop = 0;
  private vitals: Vitals;
  private container: TopHatContainer | null;

  constructor(metadata: ExtensionMetadata) {
    super(metadata);

    const f = new File('/proc/cpuinfo');
    const cpuModel = this.parseCpuOverview(f.readSync());

    this.vitals = new Vitals(cpuModel);
    this.container = null;
  }

  public enable() {
    console.log(`[TopHat] enabling version ${this.metadata.version}`);
    this.container = new TopHatContainer(1, 'TopHat');
    this.container.addMeter(new TopHatMeter('CPU Meter'));
    this.container.addMeter(new TopHatMeter('Memory Meter'));
    this.container.addMeter(new TopHatMeter('Disk Meter'));
    this.container.addMeter(new TopHatMeter('Network Meter'));
    this.addToPanel();
    if (this.loop === 0) {
      this.loop = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () =>
        this.readVitals()
      );
    }
    console.log('[TopHat] enabled');
  }

  public disable() {
    console.log(`[TopHat] disabling version ${this.metadata.version}`);
    if (this.loop > 0) {
      GLib.source_remove(this.loop);
      this.loop = 0;
    }
    this.container?.destroy();
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

  private addToPanel() {
    if (this.container === null) {
      console.error('TopHat cannot be added to panel; main container is null');
      return;
    }
    // let pref = this._getPreferredPanelBoxAndPosition();

    Main.panel.addToStatusArea(
      'TopHat',
      this.container
      // pref.position,
      // pref.box
    );

    // this.container.monitors.forEach((monitor) => {
    //   // console.debug(`Adding menu to manager for ${monitor.name}`);
    //   Main.panel.menuManager.addMenu(monitor.menu);
    //   monitor.refresh();
    // });
  }

  private readVitals(): boolean {
    this.vitals.read();
    this.vitals.getTopCpuProcs(5);
    this.vitals.getTopMemProcs(5);
    this.vitals.getTopDiskProcs(5);
    return true;
  }
}
