// Copyright (C) 2025 Todd Kulesza <todd@dropline.net>

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
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import St from 'gi://St';

export const CapacityBar = GObject.registerClass(
  class CapacityBar extends St.BoxLayout {
    private used = 0;
    private hbox;
    private barTotal;
    private barUsed;
    private color: Cogl.Color;

    constructor() {
      super({
        style_class: 'cap-bar',
        name: 'CapacityBar',
        vertical: true,
      });
      this.color = new Cogl.Color();
      this.barTotal = new St.Widget({
        style_class: 'cap-bar-total',
        name: 'barTotal',
      });
      this.barUsed = new St.Widget({
        x_expand: false,
        style_class: 'cap-bar-used',
        name: 'barUsed',
      });
      this.hbox = new St.BoxLayout();

      this.add_child(this.hbox);
      this.hbox.add_child(this.barUsed);
      this.hbox.add_child(new St.Widget({ x_expand: true }));
      this.add_child(this.barTotal);

      this.connect('notify::width', () => {
        this.setUsage(this.used);
      });
    }

    public setUsage(usage: number) {
      this.used = usage;
      const w = this.barTotal.width;
      this.barUsed.width = usage * w;
    }

    public setColor(c: string) {
      let ok;
      let color;
      if (Cogl.color_from_string) {
        [ok, color] = Cogl.color_from_string(c);
      } else {
        // GNOME 46 and earlier
        // @ts-expect-error property does not exist
        [ok, color] = Clutter.color_from_string(c);
      }
      if (!ok) {
        console.warn(`Error parsing ${c} to Cogl.Color`);
        return;
      }

      if (this.color === color) {
        return;
      }
      this.color = color;

      this.barTotal.set_background_color(this.color);
      this.barUsed.set_background_color(this.color);
    }

    override destroy(): void {
      console.log('CapacityBar.destroy()');
      this.barTotal.destroy();
      this.barUsed.destroy();
      this.hbox.destroy();
      super.destroy();
    }
  }
);
