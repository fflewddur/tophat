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
import { TopHatMeter, MeterNoVal } from './meter.js';

export const MemMonitor = GObject.registerClass(
  class MemMonitor extends TopHatMeter {
    private icon;
    private usage;
    private menuMemUsage;
    private menuSwapUsage;

    constructor(metadata: ExtensionMetadata) {
      super('Memory Monitor', metadata);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/mem-icon-symbolic.svg`
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

      this.menuMemUsage = new St.Label();
      this.menuSwapUsage = new St.Label();

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

      label = new St.Label({
        text: _('Swap used:'),
        style_class: 'menu-label menu-section-end',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuSwapUsage.text = MeterNoVal;
      this.menuSwapUsage.add_style_class_name('menu-value menu-section-end');
      this.addMenuRow(this.menuSwapUsage, 1, 1, 1);
    }

    public override bindVitals(vitals: Vitals): void {
      vitals.connect('notify::ram-usage', () => {
        const s = (vitals.ram_usage * 100).toFixed(0) + '%';
        this.usage.text = s;
        this.menuMemUsage.text = s;
      });
      vitals.connect('notify::swap-usage', () => {
        const s = (vitals.swap_usage * 100).toFixed(0) + '%';
        this.menuSwapUsage.text = s;
      });
    }
  }
);

export type MemMonitor = InstanceType<typeof MemMonitor>;
