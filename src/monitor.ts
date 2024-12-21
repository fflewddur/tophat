// Copyright (C) 2022 Todd Kulesza <todd@dropline.net>

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
import Shell from 'gi://Shell';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {
  Extension,
  ExtensionMetadata,
  ngettext,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { GnomeMajorVer } from './helpers.js';
import { MaxHistoryLen, Vitals } from './vitals.js';
import { TopHatMeter } from './meter.js';
import { HistoryChart } from './history.js';

const MENU_COLUMNS = 2;
export const MeterNoVal = 'n/a';
export const NumTopProcs = 6;

export class TopProc {
  public cmd: St.Label;
  public usage: St.Label;
  public in: St.Label;
  public out: St.Label;

  constructor() {
    this.cmd = new St.Label();
    this.usage = new St.Label();
    this.in = new St.Label();
    this.out = new St.Label();
  }
}

export const TopHatMonitor = GObject.registerClass(
  class TopHatMonitor extends PanelMenu.Button {
    private monitorName;
    protected gsettings;
    private box: St.BoxLayout;
    protected icon: St.Icon;
    protected meter: TopHatMeter;
    private menuLayout?: Clutter.GridLayout;
    private menuRow = 0;
    private menuCol = 0;
    protected menuNumCols = 0;
    protected historyChart: HistoryChart | null;
    protected metadata: ExtensionMetadata;
    protected color: string;
    protected useAccentColor: boolean;
    protected themeContext;
    protected themeContextChanged;
    protected vitals?: Vitals;
    protected vitalsSignals;

    constructor(
      nameText: string,
      metadata: ExtensionMetadata,
      gsettings: Gio.Settings
    ) {
      super(0.5, nameText, false);
      this.monitorName = nameText;
      this.metadata = metadata;
      this.gsettings = gsettings;
      this.vitalsSignals = new Array<number>(0);
      this.add_style_class_name('tophat-monitor');
      // We need to add the box as a child to `this` before
      // assigning it to this.box
      this.container.remove_all_children();
      const box = new St.BoxLayout();
      this.add_child(box);
      this.box = box;
      this.menuLayout = this.buildMenuBase();
      this.historyChart = null;

      this.icon = new St.Icon({
        style_class: 'system-status-icon tophat-panel-icon',
        // icon_name: 'emblem-default-symbolic',
      });
      this.add_child(this.icon);

      this.meter = new TopHatMeter();
      [this.color, this.useAccentColor] = this.updateColor();

      this.gsettings.bind(
        'show-icons',
        this.icon,
        'visible',
        Gio.SettingsBindFlags.GET
      );
      this.gsettings.connect('changed::meter-fg-color', () => {
        [this.color, this.useAccentColor] = this.updateColor();
      });
      this.gsettings.connect('changed::use-system-accent', () => {
        [this.color, this.useAccentColor] = this.updateColor();
      });

      // Listen for accent color changes
      this.themeContext = St.ThemeContext.get_for_stage(global.get_stage());
      this.themeContextChanged = this.themeContext.connect('changed', () => {
        [this.color, this.useAccentColor] = this.updateColor();
      });

      this.meter.connect('notify::vertical', () => {
        this.meter.reorient();
      });
      if (this.menu instanceof PopupMenu.PopupMenu) {
        // @ts-expect-error type of never
        this.menu.connect('open-state-changed', (menu, open) => {
          if (open && this.historyChart) {
            this.historyChart.refresh();
          }
        });
      }
    }

    public override add_child(w: St.Widget) {
      if (this.box) {
        this.box.add_child(w);
      } else {
        super.add_child(w);
      }
    }

    private buildMenuBase() {
      if (!this.menu || !(this.menu instanceof PopupMenu.PopupMenu)) {
        return undefined;
      }

      const statusMenu = new PopupMenu.PopupMenuSection();
      const grid = new St.Widget({
        style_class: 'menu-grid',
        layout_manager: new Clutter.GridLayout({
          orientation: Clutter.Orientation.VERTICAL,
        }),
      });
      this.menuRow = 0;
      this.menuCol = 0;
      this.menuNumCols = MENU_COLUMNS;
      statusMenu.box.add_child(grid);
      this.menu.addMenuItem(statusMenu);
      return grid.layout_manager as Clutter.GridLayout;
    }

    protected addMenuButtons() {
      if (!this.menu || !(this.menu instanceof PopupMenu.PopupMenu)) {
        return;
      }

      const box = new St.BoxLayout({
        style_class: 'tophat-menu-button-box',
        x_align: Clutter.ActorAlign.CENTER,
        reactive: true,
        x_expand: true,
      });

      // System Monitor
      const appSys = Shell.AppSystem.get_default();
      let app = appSys.lookup_app('org.gnome.SystemMonitor.desktop');
      if (!app) {
        app = appSys.lookup_app('gnome-system-monitor.desktop');
      }
      if (app) {
        const button = new St.Button({ style_class: 'button' });
        button.child = new St.Icon({
          icon_name: 'org.gnome.SystemMonitor-symbolic',
          fallback_icon_name: 'utilities-system-monitor-symbolic',
        });

        button.connect('clicked', () => {
          this.menu.close(true);
          app.activate();
        });
        box.add_child(button);
      }

      // TopHat preferences
      const button = new St.Button({ style_class: 'button' });
      button.child = new St.Icon({
        icon_name: 'preferences-system-symbolic',
      });
      button.connect('clicked', () => {
        this.menu.close(true);
        try {
          const obj = Extension.lookupByUUID('tophat@fflewddur.github.io');
          obj?.openPreferences();
        } catch (err) {
          console.error(`[TopHat] Error opening settings: ${err}`);
        }
      });
      box.add_child(button);

      this.addMenuRow(box, 0, this.menuNumCols, 1);
    }

    protected addMenuRow(
      widget: St.Widget,
      col: number,
      colSpan: number,
      rowSpan: number
    ) {
      this.menuLayout?.attach(widget, col, this.menuRow, colSpan, rowSpan);
      this.menuCol += colSpan;
      if (this.menuCol >= this.menuNumCols) {
        this.menuRow++;
        this.menuCol = 0;
      }
    }

    public bindVitals(vitals: Vitals) {
      this.vitals = vitals;
      const id = vitals.connect('notify::summary-interval', () => {
        const then = this.formatChartLimit(vitals.summary_interval);
        this.historyChart?.setThen(then);
      });
      this.vitalsSignals.push(id);
    }

    protected formatChartLimit(summaryInterval: number) {
      const limitInMins = parseInt(
        ((MaxHistoryLen * summaryInterval) / 60).toFixed(0)
      );
      const label = ngettext('%d min ago', '%d mins ago', limitInMins).format(
        limitInMins
      );
      return label;
    }

    protected updateColor(): [string, boolean] {
      let fgColor = this.gsettings.get_string('meter-fg-color');
      const useAccentColor = this.gsettings.get_boolean('use-system-accent');
      if (useAccentColor && GnomeMajorVer >= 47) {
        const themeContext = St.ThemeContext.get_for_stage(global.get_stage());
        const [color, colorAlt] = themeContext.get_accent_color();
        if (color && colorAlt) {
          fgColor = `rgb(${color.red},${color.green},${color.blue})`;
        }
      }
      this.meter?.setColor(fgColor);
      this.historyChart?.setColor(fgColor);
      return [fgColor, useAccentColor];
    }

    public getMonitorName() {
      return this.monitorName;
    }

    public override destroy() {
      for (const id of this.vitalsSignals) {
        this.vitals?.disconnect(id);
      }
      this.vitalsSignals.length = 0;
      this.box.destroy();
      this.themeContext.disconnect(this.themeContextChanged);
      this.themeContextChanged = 0;
      this.historyChart?.destroy();
      this.historyChart = null;
      super.destroy();
    }
  }
);

export type TopHatMonitor = InstanceType<typeof TopHatMonitor>;
