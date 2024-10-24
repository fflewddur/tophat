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
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// import { CpuMonitor } from './cpu.js';
import { File } from './file.js';
import { Vitals, CpuModel } from './vitals.js';
import { TopHatContainer } from './container.js';
import { TopHatMeter } from './meter.js';

enum MenuPosition {
  LeftEdge,
  Left,
  Center,
  Right,
  RightEdge,
}

export default class TopHat extends Extension {
  private gsettings?: Gio.Settings;
  private loop = 0;
  private signals = new Array<number>();
  private vitals?: Vitals;
  private container?: TopHatContainer;

  public enable() {
    console.log(`[TopHat] enabling version ${this.metadata.version}`);
    this.gsettings = this.getSettings();
    const f = new File('/proc/cpuinfo');
    const cpuModel = this.parseCpuOverview(f.readSync());
    this.vitals = new Vitals(cpuModel);
    this.addToPanel();
    if (this.loop === 0) {
      this.loop = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () =>
        this.readVitals()
      );
    }
    const id = this.gsettings.connect('changed::position-in-panel', () => {
      this.addToPanel();
    });
    this.signals.push(id);
    console.log('[TopHat] enabled');
  }

  public disable() {
    console.log(`[TopHat] disabling version ${this.metadata.version}`);
    if (this.loop > 0) {
      GLib.source_remove(this.loop);
      this.loop = 0;
    }
    this.container?.destroy();
    this.container = undefined;
    this.signals.forEach((s) => {
      this.gsettings?.disconnect(s);
    });
    this.vitals = undefined;
    this.gsettings = undefined;
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
    this.container?.destroy();
    this.container = new TopHatContainer(0.5, 'TopHat');
    this.container.addMeter(new TopHatMeter('CPU Meter'));
    this.container.addMeter(new TopHatMeter('Memory Meter'));
    this.container.addMeter(new TopHatMeter('Disk Meter'));
    this.container.addMeter(new TopHatMeter('Network Meter'));
    // if (this.container === undefined) {
    //   console.error(
    //     'TopHat cannot be added to panel; main container is undefined'
    //   );
    //   return;
    // }
    const pref = this.getPreferredPanelAttributes();
    this.container = Main.panel.addToStatusArea(
      'TopHat',
      this.container,
      pref.position,
      pref.box
    );

    this.container?.meters.forEach((m) => {
      // console.debug(`Adding menu to manager for ${monitor.name}`);
      Main.panel._onMenuSet(m);
      // monitor.refresh();
    });
  }

  private getPreferredPanelAttributes() {
    let box = 'right';
    let position = 0;
    switch (this.gsettings?.get_enum('position-in-panel')) {
      case MenuPosition.LeftEdge:
        box = 'left';
        position = 0;
        break;
      case MenuPosition.Left:
        box = 'left';
        position = -1;
        break;
      case MenuPosition.Center:
        box = 'center';
        position = 1;
        break;
      case MenuPosition.Right:
        box = 'right';
        position = 0;
        break;
      case MenuPosition.RightEdge:
        box = 'right';
        position = -1;
        break;
      default:
        console.warn('[TopHat] Unknown value for position-in-panel');
    }
    return { box, position };
  }

  private readVitals(): boolean {
    if (this.vitals) {
      this.vitals.read();
      this.vitals.getTopCpuProcs(5);
      this.vitals.getTopMemProcs(5);
      this.vitals.getTopDiskProcs(5);
    }
    return true;
  }
}
