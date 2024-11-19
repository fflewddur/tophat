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

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {
  ExtensionMetadata,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { MaxHistoryLen, Vitals } from './vitals.js';
import { TopHatMonitor, MeterNoVal, NumTopProcs, TopProc } from './monitor.js';
import { bytesToHumanString, roundMax } from './helpers.js';

export const DiskMonitor = GObject.registerClass(
  class DiskMonitor extends TopHatMonitor {
    private valueRead;
    private valueWrite;
    private menuDiskWrites;
    private menuDiskReads;
    private menuDiskWritesTotal;
    private menuDiskReadsTotal;
    private menuHistGrid: St.Widget;
    private histBarsIn: St.Widget[];
    private histBarsOut: St.Widget[];
    private histLabelIn: St.Label;
    private histLabelOut: St.Label;
    private topProcs: TopProc[];

    constructor(metadata: ExtensionMetadata, gsettings: Gio.Settings) {
      super('Disk Monitor', metadata, gsettings);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/disk-icon-symbolic.svg`
      );
      this.icon.set_gicon(gicon);

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

      this.topProcs = new Array<TopProc>(NumTopProcs);
      for (let i = 0; i < NumTopProcs; i++) {
        this.topProcs[i] = new TopProc();
      }

      this.menuHistGrid = new St.Widget({
        layout_manager: new Clutter.GridLayout({
          orientation: Clutter.Orientation.VERTICAL,
        }),
      });
      this.histLabelOut = new St.Label({
        text: _('Read'),
        y_align: Clutter.ActorAlign.START,
        style_class: 'chart-label',
      });
      this.histBarsOut = new Array<St.Widget>(MaxHistoryLen);
      for (let i = 0; i < MaxHistoryLen; i++) {
        this.histBarsOut[i] = new St.Widget({
          x_expand: true,
          y_expand: false,
          y_align: Clutter.ActorAlign.END,
          style_class: 'chart-bar chart-bar-alt',
          height: 0,
        });
      }
      this.histLabelIn = new St.Label({
        text: _('Write'),
        y_align: Clutter.ActorAlign.END,
        style_class: 'chart-label',
      });
      this.histBarsIn = new Array<St.Widget>(MaxHistoryLen);
      for (let i = 0; i < MaxHistoryLen; i++) {
        this.histBarsIn[i] = new St.Widget({
          x_expand: true,
          y_expand: false,
          y_align: Clutter.ActorAlign.START,
          style_class: 'chart-bar',
          height: 0,
        });
      }

      this.buildMenu();
      this.addMenuButtons();
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

      // Add the grid layout for the history chart
      this.addMenuRow(this.menuHistGrid, 0, 3, 1);
      const lm = this.menuHistGrid.layout_manager as Clutter.GridLayout;
      const chartOut = new St.BoxLayout({
        style_class: 'chart chart-stacked-top',
      });
      lm.attach(chartOut, 0, 0, 2, 2);
      for (const bar of this.histBarsOut) {
        chartOut.add_child(bar);
      }
      const chartIn = new St.BoxLayout({
        style_class: 'chart chart-stacked-bottom',
      });
      lm.attach(chartIn, 0, 2, 2, 2);
      for (const bar of this.histBarsIn) {
        chartIn.add_child(bar);
      }
      lm.attach(this.histLabelOut, 2, 0, 1, 1);
      label = new St.Label({
        text: '0',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'chart-label',
      });
      lm.attach(label, 2, 1, 1, 2);
      lm.attach(this.histLabelIn, 2, 3, 1, 1);
      this.histLabel.add_style_class_name('chart-label-then');
      lm.attach(this.histLabel, 0, 4, 1, 1);
      label = new St.Label({ text: _('now'), style_class: 'chart-label-now' });
      lm.attach(label, 1, 4, 1, 1);

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
    }

    public override bindVitals(vitals: Vitals): void {
      super.bindVitals(vitals);

      vitals.connect('notify::disk-read', () => {
        const s = bytesToHumanString(vitals.disk_read) + '/s';
        this.valueRead.text = s;
        this.menuDiskReads.text = s;
      });
      vitals.connect('notify::disk-wrote', () => {
        const s = bytesToHumanString(vitals.disk_wrote) + '/s';
        this.valueWrite.text = s;
        this.menuDiskWrites.text = s;
      });
      vitals.connect('notify::disk-read-total', () => {
        const s = bytesToHumanString(vitals.disk_read_total);
        this.menuDiskReadsTotal.text = s;
      });
      vitals.connect('notify::disk-wrote-total', () => {
        const s = bytesToHumanString(vitals.disk_wrote_total);
        this.menuDiskWritesTotal.text = s;
      });
      vitals.connect('notify::disk-history', () => {
        const history = vitals.getDiskActivity();
        let max = 0.001; // A very small value to prevent division by 0
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
        this.histLabelIn.text = maxLabel;
        this.histLabelOut.text = maxLabel;
        const chartOutHeight = this.histBarsOut[0].get_parent()?.height;
        const chartInHeight = this.histBarsIn[0].get_parent()?.height;
        if (!chartOutHeight || !chartInHeight) {
          return;
        }
        for (let i = 0; i < this.histBarsOut.length; i++) {
          this.histBarsOut[i].height =
            chartOutHeight * (history[history.length - i - 1].bytesRead / max);
          this.histBarsIn[i].height =
            chartInHeight *
            (history[history.length - i - 1].bytesWritten / max);
        }
      });
      vitals.connect('notify::disk-top-procs', () => {
        const procs = vitals.getTopDiskProcs(NumTopProcs);
        for (let i = 0; i < NumTopProcs; i++) {
          const w = procs[i].diskWrites();
          const r = procs[i].diskReads();
          if (w > 0 || r > 0) {
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
    }
  }
);

export type DiskMonitor = InstanceType<typeof DiskMonitor>;
