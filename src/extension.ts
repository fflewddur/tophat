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

import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { File } from './file.js';
import { Vitals, CpuModel } from './vitals.js';
import { TopHatContainer } from './container.js';
import { CpuMonitor } from './cpu.js';
import { MemMonitor } from './mem.js';
import { DiskMonitor } from './disk.js';
import { NetMonitor } from './net.js';
import { TopHatMonitor } from './monitor.js';

enum MenuPosition {
  LeftEdge,
  Left,
  Center,
  Right,
  RightEdge,
}

export default class TopHat extends Extension {
  private gsettings?: Gio.Settings;
  private signals = new Array<number>();
  private vitals?: Vitals;
  private container?: TopHatContainer;

  public enable() {
    // console.log(`[TopHat] enabling version ${this.metadata.version}`);
    this.gsettings = this.getSettings();
    const f = new File('/proc/cpuinfo');
    const cpuModel = this.parseCpuOverview(f.readSync());
    this.vitals = new Vitals(cpuModel, this.gsettings);
    this.vitals.start();
    this.addToPanel();
    const id = this.gsettings.connect('changed::position-in-panel', () => {
      this.addToPanel();
    });
    this.signals.push(id);
    // console.log('[TopHat] enabled');
  }

  public disable() {
    // console.log(`[TopHat] disabling version ${this.metadata.version}`);
    this.container?.destroy();
    this.container = undefined;
    this.signals.forEach((s) => {
      this.gsettings?.disconnect(s);
    });
    this.signals.length = 0;
    this.gsettings = undefined;
    this.vitals?.stop();
    this.vitals = undefined;
    // console.log('[TopHat] disabled');
  }

  private parseCpuOverview(cpuinfo: string): CpuModel {
    const cpus = new Set<number>();
    const tempMonitors = new Map<number, string>();

    // Count the number of physical CPUs
    const blocks = cpuinfo.split('\n\n');
    for (const block of blocks) {
      const m = block.match(/physical id\s*:\s*(\d+)/);
      if (m) {
        const id = parseInt(m[1]);
        cpus.add(id);
      }
    }
    const cores = blocks.length;

    // Find the temperature sensor for each CPU
    const base = '/sys/class/hwmon/';
    const hwmon = new File(base);
    hwmon.listSync().forEach((filename) => {
      // TODO: Add unit tests for each known temperature sensor configuration
      const name = new File(`${base}${filename}/name`).readSync();
      if (name === 'coretemp') {
        // Intel CPUs
        const prefix = new File(`${base}${filename}/temp1_label`).readSync();
        let id = 0;
        if (prefix) {
          const m = prefix.match(/Package id\s*(\d+)/);
          if (m) {
            id = parseInt(m[1]);
          }
        }
        const inputPath = `${base}${filename}/temp1_input`;
        if (new File(inputPath).exists()) {
          tempMonitors.set(id, inputPath);
        }
      } else if (name === 'k10temp') {
        // AMD CPUs
        // temp2 is Tdie, temp1 is Tctl
        let inputPath = `${base}${filename}/temp2_input`;
        const f = new File(inputPath);
        if (!f.exists()) {
          inputPath = `${base}${filename}/temp1_input`;
        }
        tempMonitors.set(0, inputPath);
      } else if (name === 'zenpower') {
        // AMD CPUs w/ alternate kernel driver
        // temp1 is Tdie, temp2 is Tctl
        let inputPath = `${base}${filename}/temp1_input`;
        const f = new File(inputPath);
        if (!f.exists()) {
          inputPath = `${base}${filename}/temp2_input`;
        }
        tempMonitors.set(0, inputPath);
      }
    });

    // Get the model name
    const lines = cpuinfo.split('\n');
    const modelRE = /^model name\s*:\s*(.*)$/;
    let model = '';
    for (const line of lines) {
      const m = !model && line.match(modelRE);
      if (m) {
        model = m[1];
        break;
      }
    }

    return new CpuModel(model, cores, cpus.size, tempMonitors);
  }

  private addToPanel() {
    if (!this.gsettings) {
      console.warn('[TopHat] error in addToPanel(): gsettings does not exist');
      return;
    }
    this.container?.destroy();
    this.container = new TopHatContainer(0.5, 'TopHat');
    this.container.addMonitor(new CpuMonitor(this.metadata, this.gsettings));
    this.container.addMonitor(new MemMonitor(this.metadata, this.gsettings));
    this.container.addMonitor(new DiskMonitor(this.metadata, this.gsettings));
    this.container.addMonitor(new NetMonitor(this.metadata, this.gsettings));
    const pref = this.getPreferredPanelAttributes();
    this.container = Main.panel.addToStatusArea(
      'TopHat',
      this.container,
      pref.position,
      pref.box
    );

    this.container?.monitors.forEach((m: TopHatMonitor) => {
      if (this.vitals) {
        m.bindVitals(this.vitals);
        Main.panel._onMenuSet(m);
      }
    });

    // Trigger notifications for properties that were set during init and will not change
    this.vitals?.notify('cpu-model');
    this.vitals?.notify('summary-interval');
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
}
