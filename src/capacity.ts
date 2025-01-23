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

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';

import * as BarLevel from 'resource:///org/gnome/shell/ui/barLevel.js';

export const CapacityBar = GObject.registerClass(
  class CapacityBar extends BarLevel.BarLevel {
    private color: Cogl.Color;

    constructor() {
      super({
        style_class: 'cap-bar slider',
        can_focus: true,
        reactive: false,
        track_hover: true,
        hover: false,
        accessible_role: Atk.Role.SLIDER,
        x_expand: true,
      });
      this.value = 0;
      this.color = new Cogl.Color();
    }

    public setUsage(usage: number) {
      this.value = usage;
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
    }

    _getPreferredHeight() {
      // @ts-expect-error does not exist
      const barHeight = super._getPreferredHeight();
      return barHeight;
    }

    _getPreferredWidth() {
      // @ts-expect-error does not exist
      const barWidth = super._getPreferredWidth();
      return barWidth;
    }
  }
);
