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
import St from 'gi://St';

// import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export const TopHatMeter = GObject.registerClass(
  class TopHatMeter extends PanelMenu.Button {
    private meterName;
    private box: St.BoxLayout;

    constructor(nameText: string) {
      super(0.5, nameText, false);
      this.meterName = nameText;
      this.add_style_class_name('tophat-monitor');
      // We need to add the box as a child to `this` before
      // assigning it to this.box
      this.container.remove_all_children();
      const box = new St.BoxLayout();
      this.add_child(box);
      this.box = box;
      this.box.add_child(new St.Label({ text: this.meterName }));
      this.buildMenuBase();
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
        return;
      }

      const statusMenu = new PopupMenu.PopupMenuSection();
      statusMenu.addMenuItem(new PopupMenu.PopupMenuItem('Hello!'));
      this.menu.addMenuItem(statusMenu);
    }
  }
);

export type TopHatMeter = InstanceType<typeof TopHatMeter>;
