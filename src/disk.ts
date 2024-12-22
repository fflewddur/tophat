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

import { Vitals } from './vitals.js';
import { TopHatMonitor, MeterNoVal, NumTopProcs, TopProc } from './monitor.js';
import { bytesToHumanString, roundMax } from './helpers.js';
import { HistoryChart, HistoryStyle } from './history.js';

export const DiskMonitor = GObject.registerClass(
  class DiskMonitor extends TopHatMonitor {
    private valueRead;
    private valueWrite;
    private menuDiskWrites;
    private menuDiskReads;
    private menuDiskWritesTotal;
    private menuDiskReadsTotal;
    private topProcs: TopProc[];

    constructor(metadata: ExtensionMetadata, gsettings: Gio.Settings) {
      super('Disk Monitor', metadata, gsettings);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/hicolor/scalable/actions/disk-icon-symbolic.svg`
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
      this.historyChart = new HistoryChart(HistoryStyle.DUAL);
      this.topProcs = new Array<TopProc>(NumTopProcs);
      for (let i = 0; i < NumTopProcs; i++) {
        this.topProcs[i] = new TopProc();
      }

      this.gsettings.bind(
        'show-disk',
        this,
        'visible',
        Gio.SettingsBindFlags.GET
      );

      this.buildMenu();
      this.addMenuButtons();
      this.updateColor();
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
      this.vitalsSignals.push(id);
    }
  }
);

export type DiskMonitor = InstanceType<typeof DiskMonitor>;
