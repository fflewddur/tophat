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
import Clutter from 'gi://Clutter';
import St from 'gi://St';

export enum Orientation {
  Horizontal,
  Vertical,
}

export const TopHatMeter = GObject.registerClass(
  class TopHatMeter extends St.BoxLayout {
    private bars: Array<St.Widget>;
    private orientation: Orientation;

    constructor() {
      super({
        style_class: 'tophat-meter',
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: true,
      });
      this.add_style_class_name('tophat-meter');
      this.bars = new Array<St.Widget>(0);
      this.orientation = Orientation.Horizontal;
    }

    public getNumBars(): number {
      return this.bars.length;
    }

    public setNumBars(n: number) {
      this.remove_all_children();
      for (const b of this.bars) {
        b.destroy();
      }
      this.bars = new Array<St.Widget>(n);
      for (let i = 0; i < n; i++) {
        this.bars[i] = new St.Widget({
          y_align: Clutter.ActorAlign.END,
          y_expand: false,
          style_class: 'meter-bar',
        });
        this.add_child(this.bars[i]);
      }
    }

    public setOrientation(o: Orientation) {
      this.orientation = o;
    }

    public setBarSizes(n: number[]) {
      if (n.length != this.bars.length) {
        console.warn(
          `[TopHat] called setBarSizes() with ${n.length} values for ${this.bars.length} bars`
        );
      }
      for (let i = 0; i < n.length; i++) {
        // console.log(
        //   `set bar[${i}].height to ${n[i]} of container height (${this.height})`
        // );
        this.bars[i].height = this.height * n[i];
      }
    }
  }
);

export type TopHatMeter = InstanceType<typeof TopHatMeter>;
