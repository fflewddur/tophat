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

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { adjustAnimationTime } from 'resource:///org/gnome/shell/misc/animationUtils.js';

export const AnimationDuration = 250;
export const AnimationEasing = Clutter.AnimationMode.LINEAR;
export enum Orientation {
  Horizontal,
  Vertical,
}

export const TopHatMeter = GObject.registerClass(
  class TopHatMeter extends St.BoxLayout {
    private bars: Array<St.Widget>;
    private barUsage: Array<number>;
    private orientation: Orientation;
    private scaleFactor = 1;
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
      this.barUsage = new Array<number>(0);
      this.orientation = Orientation.Horizontal;
      this.color = new Cogl.Color();
      this.barWidth = 8;

      const themeContext = St.ThemeContext.get_for_stage(global.get_stage());
      this.scaleFactor = themeContext.get_scale_factor();
      themeContext.connect('notify::scale-factor', (obj: St.ThemeContext) => {
        this.scaleFactor = obj.get_scale_factor();
        this.barWidth = this.computeBarWidth(this.bars.length);
        for (const b of this.bars) {
          b.set_width(this.barWidth);
        }
      });
      // themeContext.connect('changed', (source: St.ThemeContext) => {
      //   console.log('themeContext changed');
      // });

      this.connect('notify::height', () => {
        this.setBarSizes(this.barUsage);
      });
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
      this.barUsage = new Array<number>(n);
      this.barWidth = this.computeBarWidth(n);
      for (let i = 0; i < n; i++) {
        this.bars[i] = new St.Widget({
          y_align: Clutter.ActorAlign.END,
          y_expand: false,
          width: this.barWidth,
          height: 1 * this.scaleFactor,
          style_class: 'meter-bar',
          name: 'TopHatMeterBar',
        });
        setBarColor(this.bars[i], this.color);
        this.add_child(this.bars[i]);
        this.barUsage[i] = 0;
      }
    }

    private computeBarWidth(n: number, wasVertical = false) {
      let width = 8;
      if (wasVertical) {
        // If we're in vertical panel mode, use narrower widths
        if (n > 12) {
          n = 1;
        } else if (n > 9) {
          n = 2;
        } else if (n > 6) {
          width = 4;
        } else if (n > 2) {
          width = 6;
        }
      } else {
        if (n > 8) {
          width = 4; // Reduce bar width by half when there are many bars
        } else if (n > 4) {
          width = 6; // Reduce bar width by 3/4 when there are a few bars
        }
      }
      return width * this.scaleFactor;
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
      const meterHeight = this.get_height();
      const duration = adjustAnimationTime(AnimationDuration);
      for (let i = 0; i < n.length; i++) {
        const height = Math.ceil(meterHeight * n[i]);
        const curHeight = this.bars[i].height;
        const delta = Math.abs(height - curHeight);
        this.bars[i].remove_transition('scaleHeight');
        if (duration > 0 && delta > 1) {
          const t = Clutter.PropertyTransition.new_for_actor(
            this.bars[i],
            'height'
          );
          t.set_progress_mode(AnimationEasing);
          t.set_duration(duration);
          t.set_to(height);
          t.set_remove_on_complete(true);
          this.bars[i].add_transition('scaleHeight', t);
          t.start();
        } else {
          this.bars[i].set_height(height);
        }
        // cache this in case we need to re-scale the meter
        this.barUsage[i] = n[i];
      }
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

      for (const bar of this.bars) {
        setBarColor(bar, this.color);
      }
    }

    public reorient() {
      // This is to play nice with the dash-to-panel extension
      const wasVertical = this.vertical;
      this.set_vertical(false);
      this.set_x_expand(false);
      this.set_x_align(Clutter.ActorAlign.CENTER);
      this.set_y_align(Clutter.ActorAlign.CENTER);
      this.barWidth = this.computeBarWidth(this.bars.length, wasVertical);
      for (const b of this.bars) {
        b.set_width(this.barWidth);
      }
      for (let i = 0; i < this.bars.length; i++) {
        this.bars[i].remove_style_class_name('meter-bar');
        this.bars[i].set_style_class_name('meter-bar');
      }
    }

    public override destroy() {
      for (const b of this.bars) {
        b.destroy();
      }
      this.bars.length = 0;
      super.destroy();
    }
  }
);

export type TopHatMeter = InstanceType<typeof TopHatMeter>;

function setBarColor(bar: St.Widget, color: Cogl.Color) {
  let style = bar.get_style() || '';
  style = style.replaceAll(/background-color:[^;]*;\s*/g, '');
  style += `background-color: rgb(${color.red}, ${color.green}, ${color.blue});`;
  bar.set_style(style);
}
