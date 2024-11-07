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
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';

// import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {
  Extension,
  ExtensionMetadata,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { Vitals } from './vitals.js';

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

export const TopHatMeter = GObject.registerClass(
  class TopHatMeter extends PanelMenu.Button {
    private meterName;
    private box: St.BoxLayout;
    private menuLayout?: Clutter.GridLayout;
    private menuRow = 0;
    private menuCol = 0;
    protected menuNumCols = 0;
    protected metadata: ExtensionMetadata;

    constructor(nameText: string, metadata: ExtensionMetadata) {
      super(0.5, nameText, false);
      this.meterName = nameText;
      this.metadata = metadata;
      this.add_style_class_name('tophat-monitor');
      // We need to add the box as a child to `this` before
      // assigning it to this.box
      this.container.remove_all_children();
      const box = new St.BoxLayout();
      this.add_child(box);
      this.box = box;
      this.menuLayout = this.buildMenuBase();
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
      let app = appSys.lookup_app('gnome-system-monitor-kde.desktop');
      if (!app) {
        log('kde app lookup failed');
        app = appSys.lookup_app('gnome-system-monitor.desktop');
        if (!app) {
          log('gnome app lookup failed');
        }
      }
      if (app) {
        const button = new St.Button({ style_class: 'button' });
        button.child = new St.Icon({
          icon_name: 'utilities-system-monitor-symbolic',
          fallback_icon_name: 'org.gnome.SystemMonitor-symbolic',
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public bindVitals(vitals: Vitals) {
      throw new Error('Must implement bindVitals()');
    }
  }
);

export type TopHatMeter = InstanceType<typeof TopHatMeter>;
