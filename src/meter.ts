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
import Cogl from 'gi://Cogl';
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
    private color: Cogl.Color;
    private barWidth: number; // in pixels

    constructor() {
      super({
        style_class: 'tophat-meter',
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: true,
        name: 'TopHatMeter',
      });
      this.bars = new Array<St.Widget>(0);
      this.orientation = Orientation.Horizontal;

      const themeContext = St.ThemeContext.get_for_stage(global.get_stage());
      this.scaleFactor = themeContext.get_scale_factor();
      themeContext.connect('notify::scale-factor', (obj: St.ThemeContext) => {
        this.scaleFactor = obj.get_scale_factor();
        this.barWidth = this.computeBarWidth(this.bars.length);
        for (const b of this.bars) {
          b.set_width(this.barWidth);
        }
      });
      this.color = new Cogl.Color();
      this.barWidth = 8;
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
      this.barWidth = this.computeBarWidth(n);
      for (let i = 0; i < n; i++) {
        this.bars[i] = new St.Widget({
          y_align: Clutter.ActorAlign.END,
          y_expand: false,
          style_class: 'meter-bar',
          width: this.barWidth * this.scaleFactor,
          background_color: this.color,
          name: 'TopHatMeterBar',
        });
        this.add_child(this.bars[i]);
      }
    }

    private computeBarWidth(n: number, wasVertical = false) {
      let width = 8;

      if (wasVertical) {
        // If we're in vertical panel mode, use narrower widths
        width = 4;
        if (n > 4) {
          width = 2;
        }
      } else {
        if (n > 8) {
          width = 4; // Reduce bar width by half when there are many bars
        } else if (n > 4) {
          width = 6; // Reduce bar width by 3/4 when there are a few bars
        }
      }
      return width;
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
        this.bars[i].save_easing_state();
        this.bars[i].set_easing_duration(300);
        this.bars[i].set_easing_mode(Clutter.AnimationMode.EASE_IN_OUT);
        this.bars[i].set_height(n[i] * h);
        this.bars[i].restore_easing_state();
      }
    }

    public setColor(c: string) {
      const [ok, color] = Cogl.Color.from_string(c);
      if (!ok) {
        console.warn(`Error parsing ${c} to Cogl.Color`);
        return;
      }

      if (this.color === color) {
        return;
      }
      this.color = color;

      for (const bar of this.bars) {
        bar.set_background_color(this.color);
      }
    }

    public reorient() {
      console.log('reorient()');
      // FIXME: re-implement this without using stylesheets
      // This is to play nice with the dash-to-panel extension
      const wasVertical = this.vertical;
      this.set_vertical(false);
      this.set_x_expand(false);
      this.set_x_align(Clutter.ActorAlign.CENTER);
      this.set_y_align(Clutter.ActorAlign.CENTER);
      this.barWidth = this.computeBarWidth(this.bars.length, wasVertical);
      // for (let i = 0; i < this.bars.length; i++) {
      //   let style = `background-color:${this.color};width:${this.barWidth}px;`;
      //   if (i === this.bars.length - 1) {
      //     style += 'margin:0;';
      //   } else {
      //     style += 'margin:0 1px 0 0;';
      //   }
      //   this.bars[i].set_style(style);
      // }
    }
  }
);

export type TopHatMeter = InstanceType<typeof TopHatMeter>;
