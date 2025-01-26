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

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
  ExtensionMetadata,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { CapacityBar } from './capacity.js';
import {
  bytesToHumanString,
  DisplayType,
  getDisplayTypeSetting,
  roundMax,
} from './helpers.js';
import { HistoryChart, HistoryStyle } from './history.js';
import { Orientation } from './meter.js';
import { TopHatMonitor, MeterNoVal, NumTopProcs, TopProc } from './monitor.js';
import { Vitals } from './vitals.js';

class FSWidgets {
  public mount: St.Label;
  public usage: St.Label;
  public size: St.Label;
  public capacity;

  constructor(mount: string) {
    this.mount = new St.Label({
      text: mount,
      style_class: 'menu-label',
    });
    this.usage = new St.Label({
      style_class: 'menu-value',
      x_expand: true,
    });
    this.capacity = new CapacityBar();
    this.size = new St.Label({
      style_class: 'menu-details align-right menu-section-end',
    });
  }
}

export const DiskMonitor = GObject.registerClass(
  class DiskMonitor extends TopHatMonitor {
    private usage;
    private valueRead;
    private valueWrite;
    private menuDiskWrites;
    private menuDiskReads;
    private menuDiskWritesTotal;
    private menuDiskReadsTotal;
    private topProcs: TopProc[];
    private menuFSDetails?: Clutter.GridLayout;
    private menuFS = new Map<string, FSWidgets>();

    constructor(metadata: ExtensionMetadata, gsettings: Gio.Settings) {
      super('Disk Monitor', metadata, gsettings);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/hicolor/scalable/actions/disk-icon-symbolic.svg`
      );
      this.icon.set_gicon(gicon);

      this.usage = new St.Label({
        text: MeterNoVal,
        style_class: 'tophat-panel-usage',
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this.usage);

      this.meter.setNumBars(1);
      this.meter.setOrientation(Orientation.Vertical);
      this.add_child(this.meter);

      const vbox = new St.BoxLayout({ vertical: true });
      vbox.connect('notify::vertical', (obj) => {
        obj.vertical = true;
      });
      this.add_child(vbox);

      const valueRead = new St.Label({
        text: MeterNoVal,
        style_class: 'tophat-panel-usage-stacked',
        y_expand: true,
        y_align: Clutter.ActorAlign.END,
      });
      vbox.add_child(valueRead);
      this.valueRead = valueRead;
      const valueWrite = new St.Label({
        text: MeterNoVal,
        style_class: 'tophat-panel-usage-stacked',
        y_expand: true,
        y_align: Clutter.ActorAlign.START,
      });
      vbox.add_child(valueWrite);
      this.valueWrite = valueWrite;

      this.menuDiskWrites = new St.Label();
      this.menuDiskReads = new St.Label();
      this.menuDiskWritesTotal = new St.Label();
      this.menuDiskReadsTotal = new St.Label();
      this.historyChart = new HistoryChart(HistoryStyle.DUAL);
      this.topProcs = new Array<TopProc>(NumTopProcs);
      for (let i = 0; i < NumTopProcs; i++) {
        this.topProcs[i] = new TopProc();
      }

      this.updateVisibility(gsettings);
      this.gsettings.connect('changed::show-disk', (settings) => {
        this.updateVisibility(settings);
      });
      this.gsettings.connect('changed::show-fs', (settings) => {
        this.updateVisibility(settings);
      });
      this.gsettings.connect('changed::fs-display', (settings) => {
        this.updateVisibility(settings);
      });
      this.gsettings.connect('changed::mount-to-monitor', () => {
        this.vitals?.readFileSystemUsage();
      });

      this.buildMenu();
      this.addMenuButtons();
      this.updateColor();
    }

    private updateVisibility(settings: Gio.Settings) {
      const showDisk = settings.get_boolean('show-disk');
      const showFS = settings.get_boolean('show-fs');
      const displayType = getDisplayTypeSetting(settings, 'fs-display');
      this.valueRead.visible = showDisk;
      this.valueWrite.visible = showDisk;
      this.usage.visible =
        showFS &&
        (displayType === DisplayType.Both ||
          displayType === DisplayType.Numeric);
      this.meter.visible =
        showFS &&
        (displayType === DisplayType.Both || displayType === DisplayType.Chart);
      this.visible = showDisk || showFS;
    }

    private buildMenu() {
      this.menuNumCols = 3;

      let label = new St.Label({
        text: _('Disk activity'),
        style_class: 'menu-header',
      });
      this.addMenuRow(label, 0, 3, 1);

      label = new St.Label({
        text: _('Reading:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 2, 1);
      this.menuDiskReads.text = MeterNoVal;
      this.menuDiskReads.add_style_class_name('menu-value');
      this.addMenuRow(this.menuDiskReads, 2, 1, 1);

      label = new St.Label({
        text: _('Writing:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 2, 1);
      this.menuDiskWrites.text = MeterNoVal;
      this.menuDiskWrites.add_style_class_name('menu-value menu-section-end');
      this.addMenuRow(this.menuDiskWrites, 2, 1, 1);

      label = new St.Label({
        text: _('Total read:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 2, 1);
      this.menuDiskReadsTotal.text = MeterNoVal;
      this.menuDiskReadsTotal.add_style_class_name('menu-value');
      this.addMenuRow(this.menuDiskReadsTotal, 2, 1, 1);

      label = new St.Label({
        text: _('Total written:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 2, 1);
      this.menuDiskWritesTotal.text = MeterNoVal;
      this.menuDiskWritesTotal.add_style_class_name(
        'menu-value menu-section-end'
      );
      this.addMenuRow(this.menuDiskWritesTotal, 2, 1, 1);

      if (this.historyChart) {
        this.addMenuRow(this.historyChart, 0, 3, 1);
      }

      label = new St.Label({
        text: _('Top processes'),
        style_class: 'menu-header',
      });
      this.addMenuRow(label, 0, 3, 1);

      label = new St.Label({ text: '' });
      this.addMenuRow(label, 0, 1, 1);
      label = new St.Label({
        text: _('Writing'),
        style_class: 'menu-subheader',
      });
      this.addMenuRow(label, 1, 1, 1);
      label = new St.Label({
        text: _('Reading'),
        style_class: 'menu-subheader',
      });
      this.addMenuRow(label, 2, 1, 1);
      for (let i = 0; i < NumTopProcs; i++) {
        this.topProcs[i].cmd.set_style_class_name('menu-cmd-name');
        this.addMenuRow(this.topProcs[i].cmd, 0, 1, 1);
        this.topProcs[i].in.set_style_class_name('menu-cmd-activity');
        this.addMenuRow(this.topProcs[i].in, 1, 1, 1);
        this.topProcs[i].out.set_style_class_name('menu-cmd-activity');
        if (i === NumTopProcs - 1) {
          this.topProcs[i].out.add_style_class_name('menu-section-end');
        }
        this.addMenuRow(this.topProcs[i].out, 2, 1, 1);
      }

      label = new St.Label({
        text: _('Filesystem usage'),
        style_class: 'menu-header',
      });
      this.addMenuRow(label, 0, 3, 1);

      const grid = new St.Widget({
        layout_manager: new Clutter.GridLayout({
          orientation: Clutter.Orientation.VERTICAL,
        }),
      });
      this.menuFSDetails = grid.layout_manager as Clutter.GridLayout;
      this.addMenuRow(grid, 0, 3, 1);
    }

    public override bindVitals(vitals: Vitals): void {
      super.bindVitals(vitals);

      let id = vitals.connect('notify::disk-read', () => {
        const s = bytesToHumanString(vitals.disk_read) + '/s';
        this.valueRead.text = s;
        this.menuDiskReads.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::disk-wrote', () => {
        const s = bytesToHumanString(vitals.disk_wrote) + '/s';
        this.valueWrite.text = s;
        this.menuDiskWrites.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::disk-read-total', () => {
        const s = bytesToHumanString(vitals.disk_read_total);
        this.menuDiskReadsTotal.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::disk-wrote-total', () => {
        const s = bytesToHumanString(vitals.disk_wrote_total);
        this.menuDiskWritesTotal.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::disk-history', () => {
        if (!this.historyChart) {
          console.warn('[TopHat] Disk activity history chart does not exist');
          return;
        }
        const history = vitals.getDiskActivity();
        let max = 0;
        for (const da of history) {
          if (!da) {
            break;
          }
          if (da.bytesRead > max) {
            max = da.bytesRead;
          }
          if (da.bytesWritten > max) {
            max = da.bytesWritten;
          }
        }
        max = roundMax(max);
        const maxLabel = bytesToHumanString(max) + '/s';
        this.historyChart?.setYLabelBottom(maxLabel);
        this.historyChart?.setYLabelMiddle('0');
        this.historyChart?.setYLabelTop(maxLabel);
        this.historyChart?.updateAlt(history, max);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::disk-top-procs', () => {
        const procs = vitals.getTopDiskProcs(NumTopProcs);
        for (let i = 0; i < NumTopProcs; i++) {
          if (procs[i]) {
            const w = procs[i].diskWrites();
            const r = procs[i].diskReads();
            this.topProcs[i].cmd.text = procs[i].cmd;
            this.topProcs[i].in.text = bytesToHumanString(w) + '/s';
            this.topProcs[i].out.text = bytesToHumanString(r) + '/s';
          } else {
            this.topProcs[i].cmd.text = '';
            this.topProcs[i].in.text = '';
            this.topProcs[i].out.text = '';
          }
        }
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::fs-usage', () => {
        // console.log(`updated fs-usage: ${vitals.fs_usage}`);
        this.meter.setBarSizes([vitals.fs_usage / 100]);
        const s = `${vitals.fs_usage.toFixed(0)}%`;
        this.usage.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::fs-list', () => {
        console.log('notify::fs-list');
        if (!this.menuFSDetails || !this.menuFS) {
          return;
        }
        const list = vitals.getFilesystems();
        const mountPoints = new Array<string>(0);
        let row = 0;
        for (const fs of list) {
          mountPoints.push(fs.mount);
          let widgets = this.menuFS.get(fs.mount);
          if (!widgets) {
            widgets = new FSWidgets(fs.mount);
            console.log(`creating new widgets for '${fs.mount}' row=${row}`);
            this.menuFS.set(fs.mount, widgets);
          } else {
            console.log(`found widgets for '${fs.mount}' row=${row}`);
            // row += 3;
          }
          // FIXME: this doesn't work when drives are mounted / unmounted
          this.menuFSDetails.attach(widgets.mount, 0, row, 1, 1);
          this.menuFSDetails.attach(widgets.usage, 1, row, 1, 1);
          row++;
          this.menuFSDetails.attach(widgets.capacity, 0, row, 2, 1);
          row++;
          this.menuFSDetails.attach(widgets.size, 0, row, 2, 1);
          row++;

          widgets.usage.text = `${fs.usage()}%`;
          widgets.capacity.setUsage(fs.usage() / 100);
          widgets.capacity.setColor(this.color);
          widgets.size.text = _(
            `${bytesToHumanString(fs.cap - fs.used)} available of ${bytesToHumanString(fs.cap)}`
          );
        }

        // Remove rows for filesystems that we're no longer monitoring
        console.log(`mountPoints: ${mountPoints}`);
        for (const mountPoint of this.menuFS.keys()) {
          if (!mountPoints.includes(mountPoint)) {
            console.log(`mountPoint ${mountPoint} not in list`);
            const widgets = this.menuFS.get(mountPoint);
            if (widgets) {
              widgets.mount.destroy();
              widgets.usage.destroy();
              widgets.capacity.destroy();
              widgets.size.destroy();
            }
            this.menuFS.delete(mountPoint);
          }
        }
      });
      this.vitalsSignals.push(id);
    }

    protected override updateColor(): [string, boolean] {
      const [color, useAccent] = super.updateColor();
      this.color = color;
      if (this.menuFS) {
        for (const widgets of this.menuFS.values()) {
          widgets.capacity.setColor(color);
        }
      }
      return [color, useAccent];
    }
  }
);

export type DiskMonitor = InstanceType<typeof DiskMonitor>;
