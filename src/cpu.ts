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
  ngettext,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { Vitals } from './vitals.js';
import { TopHatMonitor, MeterNoVal, NumTopProcs, TopProc } from './monitor.js';
import { Orientation } from './meter.js';
import { HistoryChart } from './history.js';
import { DisplayType, getDisplayTypeSetting } from './helpers.js';

export const CpuMonitor = GObject.registerClass(
  class CpuMonitor extends TopHatMonitor {
    private usage;
    private menuCpuUsage;
    private menuCpuModel;
    private menuCpuFreq;
    private menuCpuTemp;
    private menuUptime;
    private topProcs: TopProc[];
    private showCores;
    private normalizeProcUsage;
    private displayType: DisplayType;

    constructor(metadata: ExtensionMetadata, gsettings: Gio.Settings) {
      super('CPU Monitor', metadata, gsettings);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/hicolor/scalable/actions/cpu-icon-symbolic.svg`
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
      this.historyChart = new HistoryChart();
      this.topProcs = new Array<TopProc>(NumTopProcs);
      for (let i = 0; i < NumTopProcs; i++) {
        this.topProcs[i] = new TopProc();
      }

      this.gsettings.bind(
        'show-cpu',
        this,
        'visible',
        Gio.SettingsBindFlags.GET
      );
      this.showCores = this.gsettings.get_boolean('cpu-show-cores');
      this.gsettings.connect('changed::cpu-show-cores', (settings) => {
        this.showCores = settings.get_boolean('cpu-show-cores');
        if (!this.showCores) {
          this.meter.setNumBars(1);
        }
      });
      this.normalizeProcUsage = this.gsettings.get_boolean(
        'cpu-normalize-proc-use'
      );
      this.gsettings.connect('changed::cpu-normalize-proc-use', (settings) => {
        this.normalizeProcUsage = settings.get_boolean(
          'cpu-normalize-proc-use'
        );
      });
      this.gsettings.connect('changed::cpu-display', () => {
        this.updateDisplayType();
      });

      this.displayType = this.updateDisplayType();
      this.buildMenu();
      this.addMenuButtons();
      this.updateColor();
    }

    private updateDisplayType() {
      this.displayType = getDisplayTypeSetting(this.gsettings, 'cpu-display');
      if (this.displayType === DisplayType.Both) {
        this.usage.show();
        this.meter.show();
      } else {
        if (this.displayType === DisplayType.Chart) {
          this.usage.hide();
          this.meter.show();
        } else {
          this.usage.show();
          this.meter.hide();
        }
      }
      return this.displayType;
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

      if (this.historyChart) {
        this.addMenuRow(this.historyChart, 0, 2, 1);
      }

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
      super.bindVitals(vitals);

      let id = vitals.connect('notify::cpu-usage', () => {
        // console.log(`cpu-usage: ${vitals.cpu_usage}`);
        const percent = vitals.cpu_usage * 100;
        const s = percent.toFixed(0) + '%';
        this.usage.text = s;
        this.menuCpuUsage.text = s;
        if (this.showCores) {
          if (this.meter.getNumBars() === 1) {
            this.meter.setNumBars(vitals.getCpuCoreUsage().length);
          }
          this.meter.setBarSizes(
            vitals.getCpuCoreUsage().sort((a, b) => b - a)
          );
        } else {
          if (this.meter.getNumBars() !== 1) {
            this.meter.setNumBars(1);
          }
          this.meter.setBarSizes([vitals.cpu_usage]);
        }
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::cpu-model', () => {
        // console.log(`cpu-model: ${vitals.cpu_model}`);
        const s = vitals.cpu_model;
        this.menuCpuModel.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::cpu-freq', () => {
        // console.log(`cpu-freq: ${vitals.cpu_freq}`);
        const s = vitals.cpu_freq.toFixed(1) + ' GHz';
        this.menuCpuFreq.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::cpu-temp', () => {
        // console.log(`cpu-temp: ${vitals.cpu_temp}`);
        const s = vitals.cpu_temp.toFixed(0) + ' °C';
        this.menuCpuTemp.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::cpu-top-procs', () => {
        const procs = vitals.getTopCpuProcs(NumTopProcs);
        // console.log(`cpu-top-procs: ${procs}`);
        for (let i = 0; i < NumTopProcs; i++) {
          let cpu = procs[i].cpuUsage();
          if (cpu > 0) {
            if (!this.normalizeProcUsage) {
              cpu *= vitals.cpuModel.cores;
            }
            if (cpu >= 0.01) {
              this.topProcs[i].usage.text = (cpu * 100).toFixed(0) + '%';
            } else {
              this.topProcs[i].usage.text = '< 1%';
            }
            this.topProcs[i].cmd.text = procs[i].cmd;
          } else {
            this.topProcs[i].cmd.text = '';
            this.topProcs[i].usage.text = '';
          }
        }
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::cpu-history', () => {
        this.historyChart?.update(vitals.getCpuHistory());
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::uptime', () => {
        const s = this.formatUptime(vitals.uptime);
        this.menuUptime.text = s;
      });
      this.vitalsSignals.push(id);
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
