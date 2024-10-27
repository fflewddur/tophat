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

import { Vitals } from './vitals.js';
import { TopHatMeter, MeterNoVal } from './meter.js';

export const CpuMonitor = GObject.registerClass(
  class CpuMonitor extends TopHatMeter {
    private icon;
    private usage;
    private menuCpuUsage;
    private menuUptime;

    constructor(metadata: ExtensionMetadata) {
      super('CPU Monitor', metadata);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/cpu-icon-symbolic.svg`
      );
      this.icon = new St.Icon({
        gicon,
        style_class: 'system-status-icon tophat-panel-icon',
      });
      this.add_child(this.icon);

      this.usage = new St.Label({
        text: MeterNoVal,
        style_class: 'tophat-panel-usage',
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this.usage);

      this.menuCpuUsage = new St.Label();
      this.menuUptime = new St.Label();

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
        style_class: 'menu-label menu-section-end',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuCpuUsage.text = MeterNoVal;
      this.menuCpuUsage.add_style_class_name('menu-value menu-section-end');
      this.addMenuRow(this.menuCpuUsage, 1, 1, 1);

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
        const s = (vitals.cpu_usage * 100).toFixed(0) + '%';
        this.usage.text = s;
        this.menuCpuUsage.text = s;
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
