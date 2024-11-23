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
    private scaleFactor;
    private color: string;

    constructor() {
      super({
        style_class: 'tophat-meter',
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: true,
        name: 'TopHatMeter',
      });
      this.add_style_class_name('tophat-meter');
      this.bars = new Array<St.Widget>(0);
      this.orientation = Orientation.Horizontal;

      const themeContext = St.ThemeContext.get_for_stage(global.get_stage());
      this.scaleFactor = themeContext.get_scale_factor();
      themeContext.connect('notify::scale-factor', (obj: St.ThemeContext) => {
        this.scaleFactor = obj.get_scale_factor();
        const width = this.computeBarWidth(this.bars.length);
        for (const b of this.bars) {
          b.width = width;
        }
      });
      this.color = '';
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
      const width = this.computeBarWidth(n);
      for (let i = 0; i < n; i++) {
        this.bars[i] = new St.Widget({
          y_align: Clutter.ActorAlign.END,
          y_expand: false,
          style_class: 'meter-bar',
          width: width,
          name: 'TopHatMeterBar',
        });
        this.bars[i].save_easing_state();
        this.bars[i].set_easing_duration(300);
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
      const h = this.get_height();
      for (let i = 0; i < n.length; i++) {
        const fillSize = Math.ceil(n[i] * h) / this.scaleFactor;
        const style = `height:${fillSize}px;background-color:${this.color}`;
        this.bars[i].set_style(style);
      }
    }

    public setColor(c: string) {
      if (this.color === c) {
        return;
      }

      this.color = c;
      for (const bar of this.bars) {
        bar.set_style(`background-color:${this.color}`);
      }
    }

    private computeBarWidth(n: number) {
      let width = 8;
      if (n > 8) {
        width = 4; // Reduce bar width by half when there are many bars
      } else if (n > 4) {
        width = 6; // Reduce bar width by 3/4 when there are a few bars
      }
      return width * this.scaleFactor;
    }
  }
);

export type TopHatMeter = InstanceType<typeof TopHatMeter>;
