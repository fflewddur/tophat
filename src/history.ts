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
// import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { MaxHistoryLen } from './vitals.js';

export enum HistoryStyle {
  SINGLE,
  DUAL,
}

export const HistoryChart = GObject.registerClass(
  class HistoryChart extends St.Bin {
    private chartStyle;
    private grid;
    private lm;
    private bars;
    private barsAlt?: Array<St.Widget>;
    private yLabelTop;
    private yLabelMiddle;
    private yLabelBottom;
    private xLabelNow;
    private xLabelThen;

    constructor(style = HistoryStyle.DUAL) {
      super();
      this.chartStyle = style;
      this.grid = new St.Widget({
        layout_manager: new Clutter.GridLayout({
          orientation: Clutter.Orientation.VERTICAL,
        }),
      });
      this.add_child(this.grid);
      this.lm = this.grid.layout_manager as Clutter.GridLayout;
      this.bars = new Array<St.Widget>(MaxHistoryLen);
      for (let i = 0; i < MaxHistoryLen; i++) {
        this.bars[i] = new St.Widget({
          x_expand: true,
          y_expand: false,
          y_align: Clutter.ActorAlign.END,
          style_class: 'chart-bar',
          height: 0,
        });
      }
      if (this.chartStyle === HistoryStyle.DUAL) {
        this.barsAlt = new Array<St.Widget>(MaxHistoryLen);
        for (let i = 0; i < MaxHistoryLen; i++) {
          this.barsAlt[i] = new St.Widget({
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
            style_class: 'chart-bar',
            height: 0,
          });
        }
      }
      this.yLabelTop = new St.Label();
      this.yLabelMiddle = new St.Label();
      this.yLabelBottom = new St.Label();
      this.xLabelNow = new St.Label();
      this.xLabelThen = new St.Label();

      this.build();
    }

    public setYLabelTop(s: string) {
      this.yLabelTop.text = s;
    }

    public setYLabelMiddle(s: string) {
      this.yLabelMiddle.text = s;
    }

    public setYLabelBottom(s: string) {
      this.yLabelBottom.text = s;
    }

    public setThen(s: string) {
      this.xLabelThen.text = s;
    }

    public update(usage: number) {
      const chartHeight = this.bars[0].get_parent()?.height;
      if (!chartHeight) {
        return;
      }
      for (let i = 0; i < this.bars.length - 1; i++) {
        this.bars[i].height = this.bars[i + 1].height;
      }
      this.bars[this.bars.length - 1].height = Math.round(chartHeight * usage);
    }

    public setColor(color: string) {
      for (const bar of this.bars) {
        bar.set_style(`background-color:${color}`);
      }
    }

    private build() {
      const chart = new St.BoxLayout({ style_class: 'chart' });
      this.lm.attach(chart, 0, 0, 2, 3);
      for (const bar of this.bars) {
        chart.add_child(bar);
      }
      this.yLabelTop.text = '100%';
      this.yLabelTop.y_align = Clutter.ActorAlign.START;
      this.yLabelTop.add_style_class_name('chart-label');
      this.lm.attach(this.yLabelTop, 2, 0, 1, 1);

      this.yLabelMiddle.text = '50%';
      this.yLabelMiddle.y_align = Clutter.ActorAlign.CENTER;
      this.yLabelMiddle.add_style_class_name('chart-label');
      this.lm.attach(this.yLabelMiddle, 2, 1, 1, 1);

      this.yLabelBottom.text = '0%';
      this.yLabelBottom.y_align = Clutter.ActorAlign.END;
      this.yLabelBottom.add_style_class_name('chart-label');
      this.lm.attach(this.yLabelBottom, 2, 2, 1, 1);

      this.xLabelThen.add_style_class_name('chart-label-then');
      this.lm.attach(this.xLabelThen, 0, 3, 1, 1);

      this.xLabelNow.text = _('now');
      this.xLabelNow.add_style_class_name('chart-label-now');
      this.lm.attach(this.xLabelNow, 1, 3, 1, 1);
    }
  }
);

export type HistoryChart = InstanceType<typeof HistoryChart>;
