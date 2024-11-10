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
  ngettext,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { MaxHistoryLen, SummaryInterval, Vitals } from './vitals.js';
import { Orientation } from './meter.js';
import { TopHatMonitor, MeterNoVal, NumTopProcs, TopProc } from './monitor.js';
import { bytesToHumanString } from './helpers.js';

export const MemMonitor = GObject.registerClass(
  class MemMonitor extends TopHatMonitor {
    private usage;
    private menuMemUsage;
    private menuMemSize;
    private menuSwapUsage;
    private menuSwapSize;
    private menuHistGrid: St.Widget;
    private histBars: St.Widget[];
    private topProcs: TopProc[];

    constructor(metadata: ExtensionMetadata, gsettings: Gio.Settings) {
      super('Memory Monitor', metadata, gsettings);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/mem-icon-symbolic.svg`
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

      this.menuMemUsage = new St.Label();
      this.menuMemSize = new St.Label();
      this.menuSwapUsage = new St.Label();
      this.menuSwapSize = new St.Label();
      this.menuHistGrid = new St.Widget({
        layout_manager: new Clutter.GridLayout({
          orientation: Clutter.Orientation.VERTICAL,
        }),
      });
      this.histBars = new Array<St.Widget>(MaxHistoryLen);
      for (let i = 0; i < MaxHistoryLen; i++) {
        this.histBars[i] = new St.Widget({
          x_expand: true,
          y_expand: false,
          y_align: Clutter.ActorAlign.END,
          style_class: 'chart-bar',
          height: 0,
        });
      }
      this.topProcs = new Array<TopProc>(NumTopProcs);
      for (let i = 0; i < NumTopProcs; i++) {
        this.topProcs[i] = new TopProc();
      }

      this.buildMenu();
      this.addMenuButtons();
    }

    private buildMenu() {
      let label = new St.Label({
        text: _('Memory usage'),
        style_class: 'menu-header',
      });
      this.addMenuRow(label, 0, 2, 1);

      label = new St.Label({
        text: _('RAM used:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuMemUsage.text = MeterNoVal;
      this.menuMemUsage.add_style_class_name('menu-value');
      this.addMenuRow(this.menuMemUsage, 1, 1, 1);

      this.menuMemSize.text = _(`size ${MeterNoVal}`);
      this.menuMemSize.add_style_class_name(
        'menu-details align-right menu-section-end'
      );
      this.addMenuRow(this.menuMemSize, 0, 2, 1);

      label = new St.Label({
        text: _('Swap used:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuSwapUsage.text = MeterNoVal;
      this.menuSwapUsage.add_style_class_name('menu-value');
      this.addMenuRow(this.menuSwapUsage, 1, 1, 1);

      this.menuSwapSize.text = _(`size ${MeterNoVal}`);
      this.menuSwapSize.add_style_class_name(
        'menu-details align-right menu-section-end'
      );
      this.addMenuRow(this.menuSwapSize, 0, 2, 1);

      // Add the grid layout for the history chart
      this.addMenuRow(this.menuHistGrid, 0, 2, 1);
      const lm = this.menuHistGrid.layout_manager as Clutter.GridLayout;
      const chart = new St.BoxLayout({ style_class: 'chart' });
      lm.attach(chart, 0, 0, 2, 3);
      for (const bar of this.histBars) {
        chart.add_child(bar);
      }
      label = new St.Label({
        text: '100%',
        y_align: Clutter.ActorAlign.START,
        style_class: 'chart-label',
      });
      lm.attach(label, 2, 0, 1, 1);
      label = new St.Label({
        text: '50%',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'chart-label',
      });
      lm.attach(label, 2, 1, 1, 1);
      label = new St.Label({
        text: '0',
        y_align: Clutter.ActorAlign.END,
        style_class: 'chart-label',
      });
      lm.attach(label, 2, 2, 1, 1);
      const limitInMins = (MaxHistoryLen * SummaryInterval) / 60;
      const startLabel = ngettext(
        '%d min ago',
        '%d mins ago',
        limitInMins
      ).format(limitInMins);
      label = new St.Label({
        text: startLabel,
        style_class: 'chart-label-then',
      });
      lm.attach(label, 0, 3, 1, 1);
      label = new St.Label({ text: _('now'), style_class: 'chart-label-now' });
      lm.attach(label, 1, 3, 1, 1);

      label = new St.Label({
        text: _('Top processes'),
        style_class: 'menu-header',
      });
      this.addMenuRow(label, 0, 2, 1);
      for (let i = 0; i < NumTopProcs; i++) {
        this.topProcs[i].cmd.set_style_class_name('menu-cmd-name');
        this.addMenuRow(this.topProcs[i].cmd, 0, 1, 1);
        this.topProcs[i].usage.set_style_class_name('menu-cmd-usage');
        if (i === NumTopProcs - 1) {
          this.topProcs[i].usage.add_style_class_name('menu-section-end');
        }
        this.addMenuRow(this.topProcs[i].usage, 1, 1, 1);
      }
    }

    public override bindVitals(vitals: Vitals): void {
      vitals.connect('notify::ram-size', () => {
        const total = bytesToHumanString(vitals.ram_size);
        const free = bytesToHumanString(vitals.ram_size_free);
        this.menuMemSize.text = _(`${free} available of ${total}`);
      });
      vitals.connect('notify::ram-size-free', () => {
        const total = bytesToHumanString(vitals.ram_size);
        const free = bytesToHumanString(vitals.ram_size_free);
        this.menuMemSize.text = _(`${free} available of ${total}`);
      });
      vitals.connect('notify::ram-usage', () => {
        const s = (vitals.ram_usage * 100).toFixed(0) + '%';
        this.usage.text = s;
        this.menuMemUsage.text = s;
        this.meter.setBarSizes([vitals.ram_usage]);
      });
      vitals.connect('notify::swap-size', () => {
        const total = bytesToHumanString(vitals.swap_size);
        const free = bytesToHumanString(vitals.swap_size_free);
        this.menuMemSize.text = _(`${free} available of ${total}`);
      });
      vitals.connect('notify::swap-size-free', () => {
        const total = bytesToHumanString(vitals.swap_size);
        const free = bytesToHumanString(vitals.swap_size_free);
        this.menuSwapSize.text = _(`${free} available of ${total}`);
      });
      vitals.connect('notify::swap-usage', () => {
        const s = (vitals.swap_usage * 100).toFixed(0) + '%';
        this.menuSwapUsage.text = s;
      });
      vitals.connect('notify::mem-history', () => {
        const chartHeight = this.histBars[0].get_parent()?.height;
        if (!chartHeight) {
          return;
        }
        for (let i = 0; i < this.histBars.length - 1; i++) {
          this.histBars[i].height = this.histBars[i + 1].height;
        }
        this.histBars[this.histBars.length - 1].height = Math.round(
          chartHeight * vitals.ram_usage
        );
      });
      vitals.connect('notify::mem-top-procs', () => {
        const procs = vitals.getTopMemProcs(NumTopProcs);
        for (let i = 0; i < NumTopProcs; i++) {
          this.topProcs[i].cmd.text = procs[i].cmd;
          this.topProcs[i].usage.text = bytesToHumanString(procs[i].memUsage());
        }
      });
    }
  }
);

export type MemMonitor = InstanceType<typeof MemMonitor>;
