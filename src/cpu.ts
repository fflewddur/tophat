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
import { TopHatMonitor, MeterNoVal, NumTopProcs, TopProc } from './monitor.js';
import { Orientation } from './meter.js';

export const CpuMonitor = GObject.registerClass(
  class CpuMonitor extends TopHatMonitor {
    private usage;
    private menuCpuUsage;
    private menuCpuModel;
    private menuCpuFreq;
    private menuCpuTemp;
    private menuHistGrid: St.Widget;
    private menuUptime;
    private histBars: St.Widget[];
    private topProcs: TopProc[];

    constructor(metadata: ExtensionMetadata, gsettings: Gio.Settings) {
      super('CPU Monitor', metadata, gsettings);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/cpu-icon-symbolic.svg`
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

      this.menuCpuUsage = new St.Label();
      this.menuCpuModel = new St.Label();
      this.menuCpuFreq = new St.Label();
      this.menuCpuTemp = new St.Label();
      this.menuUptime = new St.Label();
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
        text: _('Processor usage'),
        style_class: 'menu-header',
      });
      this.addMenuRow(label, 0, 2, 1);

      label = new St.Label({
        text: _('Processor utilization:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuCpuUsage.text = MeterNoVal;
      this.menuCpuUsage.add_style_class_name('menu-value menu-section-end');
      this.addMenuRow(this.menuCpuUsage, 1, 1, 1);

      // TODO: if we have multiple sockets, create a section for each
      this.menuCpuModel.text = _(`model ${MeterNoVal}`);
      this.menuCpuModel.add_style_class_name('menu-label menu-details');
      this.menuCpuModel.set_x_expand(true);
      this.addMenuRow(this.menuCpuModel, 0, 2, 1);
      label = new St.Label({
        text: _('Frequency:'),
        style_class: 'menu-label menu-details',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuCpuFreq.text = MeterNoVal;
      this.menuCpuFreq.add_style_class_name('menu-value menu-details');
      this.addMenuRow(this.menuCpuFreq, 1, 1, 1);
      label = new St.Label({
        text: _('Temperature:'),
        style_class: 'menu-label menu-details menu-section-end',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuCpuTemp.text = MeterNoVal;
      this.menuCpuTemp.add_style_class_name(
        'menu-value menu-details menu-section-end'
      );
      this.addMenuRow(this.menuCpuTemp, 1, 1, 1);

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

      label = new St.Label({
        text: _('System uptime'),
        style_class: 'menu-header',
      });
      this.addMenuRow(label, 0, 2, 1);
      this.menuUptime.text = MeterNoVal;
      this.menuUptime.add_style_class_name('menu-uptime menu-section-end');
      this.addMenuRow(this.menuUptime, 0, 2, 1);
    }

    public override bindVitals(vitals: Vitals): void {
      vitals.connect('notify::cpu-usage', () => {
        const percent = vitals.cpu_usage * 100;
        const s = percent.toFixed(0) + '%';
        this.usage.text = s;
        this.menuCpuUsage.text = s;
        if (this.meter.getNumBars() === 1) {
          this.meter.setNumBars(vitals.getCpuCoreUsage().length);
        }
        this.meter.setBarSizes(vitals.getCpuCoreUsage().sort((a, b) => b - a));
      });
      vitals.connect('notify::cpu-model', () => {
        const s = vitals.cpu_model;
        this.menuCpuModel.text = s;
      });
      vitals.connect('notify::cpu-freq', () => {
        const s = (vitals.cpu_freq / 1000).toFixed(1) + ' GHz';
        this.menuCpuFreq.text = s;
      });
      vitals.connect('notify::cpu-temp', () => {
        const s = (vitals.cpu_temp / 1000).toFixed(0) + ' °C';
        this.menuCpuTemp.text = s;
      });
      vitals.connect('notify::cpu-top-procs', () => {
        const procs = vitals.getTopCpuProcs(NumTopProcs);
        for (let i = 0; i < NumTopProcs; i++) {
          const cpu = procs[i].cpuUsage();
          if (cpu > 0) {
            this.topProcs[i].cmd.text = procs[i].cmd;
            this.topProcs[i].usage.text = (cpu * 100).toFixed(1) + '%';
          } else {
            this.topProcs[i].cmd.text = '';
            this.topProcs[i].usage.text = '';
          }
        }
      });
      vitals.connect('notify::cpu-history', () => {
        const chartHeight = this.histBars[0].get_parent()?.height;
        if (!chartHeight) {
          return;
        }
        for (let i = 0; i < this.histBars.length - 1; i++) {
          this.histBars[i].height = this.histBars[i + 1].height;
        }
        this.histBars[this.histBars.length - 1].height = Math.round(
          chartHeight * vitals.cpu_usage
        );
      });
      vitals.connect('notify::uptime', () => {
        const s = this.formatUptime(vitals.uptime);
        this.menuUptime.text = s;
      });
    }

    private formatUptime(seconds: number): string {
      let days = 0,
        hours = 0,
        mins = 0;
      mins = Math.floor((seconds % 3600) / 60);
      hours = Math.floor((seconds % 86400) / 3600);
      days = Math.floor(seconds / 86400);
      const parts = [];
      if (days > 0) {
        parts.push(ngettext('%d day', '%d days', days).format(days));
      }
      if (days > 0 || hours > 0) {
        parts.push(ngettext('%d hour', '%d hours', hours).format(hours));
      }
      parts.push(ngettext('%d minute', '%d minutes', mins).format(mins));
      return parts.join(' ');
    }
  }
);

export type CpuMonitor = InstanceType<typeof CpuMonitor>;
