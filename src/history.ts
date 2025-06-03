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
import GObject from 'gi://GObject';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { IActivity, IHistory, MaxHistoryLen } from './vitals.js';

export enum HistoryStyle {
  SINGLE,
  DUAL,
}

export const HistoryChart = GObject.registerClass(
  class HistoryChart extends St.Bin {
    private chartStyle;
    private grid;
    private lm;
    private chart: St.BoxLayout;
    private chartAlt: St.BoxLayout | null;
    private bars: Array<St.Widget>;
    private barsAlt: Array<St.Widget> | null;
    private priorActivity: IHistory[] | null;
    private priorActivityAlt: IActivity[] | null;
    private priorMax = 0;
    private chartHeight = 0;
    private chartHeightAlt = 0;
    private yLabelTop;
    private yLabelMiddle;
    private yLabelBottom;
    private xLabelNow;
    private xLabelThen;

    constructor(style = HistoryStyle.SINGLE) {
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
          name: 'HistoryBar',
          x_expand: true,
          y_expand: false,
          y_align: Clutter.ActorAlign.END,
          style_class: 'tophat-chart-bar',
          height: 0,
        });
      }
      this.chart = new St.BoxLayout({ style_class: 'tophat-chart' });
      if (this.chartStyle === HistoryStyle.DUAL) {
        this.barsAlt = new Array<St.Widget>(MaxHistoryLen);
        for (let i = 0; i < MaxHistoryLen; i++) {
          this.barsAlt[i] = new St.Widget({
            name: 'HistoryBarAlt',
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
            style_class: 'tophat-chart-bar tophat-chart-bar-alt',
            height: 0,
          });
        }
        this.chartAlt = new St.BoxLayout({
          style_class: 'tophat-chart tophat-chart-stacked-bottom',
        });
      } else {
        this.barsAlt = null;
        this.chartAlt = null;
      }

      this.priorActivity = null;
      this.priorActivityAlt = null;
      this.yLabelTop = new St.Label();
      this.yLabelMiddle = new St.Label();
      this.yLabelBottom = new St.Label();
      this.xLabelNow = new St.Label();
      this.xLabelThen = new St.Label();

      // When the menus are closed, the chart's height changes
      // but no notify::height signal is emitted. We cache this
      // value so we always know what the actual, visible height
      // of the chart will be.
      // TODO(fflewddur): Investigate if I'm just holding this wrong
      this.chart.connect('notify::height', (w) => {
        this.chartHeight = w.height;
        if (this.chartStyle === HistoryStyle.SINGLE && this.priorActivity) {
          this.update(this.priorActivity);
        } else if (this.priorActivityAlt && this.chartAlt) {
          this.chartHeightAlt = this.chartAlt.height;
          this.updateAlt(this.priorActivityAlt, this.priorMax);
        }
      });
      if (this.chartAlt) {
        this.chartAlt.connect('notify::height', (w) => {
          this.chartHeightAlt = w.height;
          if (!this.priorActivityAlt) {
            return;
          }
          this.updateAlt(this.priorActivityAlt, this.priorMax);
        });
      }

      this.build();
    }

    public refresh() {
      if (this.chartStyle === HistoryStyle.SINGLE && this.priorActivity) {
        this.update(this.priorActivity);
      } else if (
        this.chartStyle === HistoryStyle.DUAL &&
        this.priorActivityAlt
      ) {
        this.updateAlt(this.priorActivityAlt, this.priorMax);
      }
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

    public update(usage: IHistory[]) {
      for (let i = 0; i < this.bars.length; i++) {
        const u = usage[usage.length - i - 1].val();
        if (u < 0) {
          console.warn(`update(): usage[${usage.length - i - 1}] < 0: ${u}`);
        } else if (u > 1) {
          console.warn(`update(): usage[${usage.length - i - 1} > 1: ${u}]`);
        }
        const h = this.chartHeight * u;
        if (Number.isNaN(h)) {
          console.warn(`update(): height is NaN`);
        }
        this.bars[i].height = h;
      }
      this.priorActivity = usage;
    }

    public updateAlt(usage: IActivity[], max: number) {
      if (!this.chartAlt || !this.barsAlt) {
        console.warn('[TopHat] chartAlt is null');
        return;
      }
      for (let i = 0; i < this.bars.length; i++) {
        let u = usage[usage.length - i - 1].val() / max;
        let uAlt = usage[usage.length - i - 1].valAlt() / max;
        if (u < 0) {
          console.warn(`updateAlt(): usage[${usage.length - i - 1}] < 0: ${u}`);
          u = 0;
        } else if (u > 1) {
          console.warn(`updateAlt(): usage[${usage.length - i - 1} > 1: ${u}]`);
          u = 1;
        }
        if (uAlt < 0) {
          console.warn(
            `updateAlt(): usage[${usage.length - i - 1}] < 0: ${uAlt}`
          );
          uAlt = 0;
        } else if (uAlt > 1) {
          console.warn(
            `updateAlt(): usage[${usage.length - i - 1} > 1: ${uAlt}]`
          );
          uAlt = 1;
        }
        let height = 0;
        let heightAlt = 0;
        if (max) {
          height = this.chartHeight * uAlt;
          heightAlt = this.chartHeightAlt * u;
        }
        if (Number.isNaN(height)) {
          console.warn(`update(): height is NaN`);
        }
        if (Number.isNaN(heightAlt)) {
          console.warn(`update(): heightAlt is NaN`);
        }
        this.bars[i].height = height;
        this.barsAlt[i].height = heightAlt;
      }
      this.priorActivityAlt = usage;
      this.priorMax = max;
    }

    public setColor(color: string) {
      for (const bar of this.bars) {
        bar.set_style(`background-color:${color}`);
      }
      if (this.barsAlt) {
        for (const barAlt of this.barsAlt) {
          barAlt.set_style(`background-color:${color}`);
        }
      }
    }

    private build() {
      let chartRowSpan = 2;
      if (this.barsAlt) {
        chartRowSpan = 1;
      }

      this.lm.attach(this.chart, 0, 0, 2, chartRowSpan);
      for (const bar of this.bars) {
        this.chart.add_child(bar);
      }
      if (this.barsAlt && this.chartAlt) {
        this.lm.attach(this.chartAlt, 0, 1, 2, chartRowSpan);
        for (const bar of this.barsAlt) {
          this.chartAlt.add_child(bar);
        }
        this.chart.add_style_class_name('tophat-chart-stacked-top');
      }

      const vbox = new St.BoxLayout({ vertical: true, y_expand: true });
      this.lm.attach(vbox, 2, 0, 1, 2);

      this.yLabelTop.text = '100%';
      this.yLabelTop.y_align = Clutter.ActorAlign.START;
      this.yLabelTop.y_expand = true;
      this.yLabelTop.add_style_class_name('tophat-chart-label');
      vbox.add_child(this.yLabelTop);

      this.yLabelMiddle.text = '50%';
      this.yLabelMiddle.y_align = Clutter.ActorAlign.CENTER;
      this.yLabelMiddle.y_expand = true;
      this.yLabelMiddle.add_style_class_name('tophat-chart-label');
      vbox.add_child(this.yLabelMiddle);

      this.yLabelBottom.text = '0%';
      this.yLabelBottom.y_align = Clutter.ActorAlign.END;
      this.yLabelBottom.y_expand = true;
      this.yLabelBottom.add_style_class_name('tophat-chart-label');
      vbox.add_child(this.yLabelBottom);

      this.xLabelThen.add_style_class_name('tophat-chart-label-then');
      this.lm.attach(this.xLabelThen, 0, 2, 1, 1);

      this.xLabelNow.text = _('now');
      this.xLabelNow.add_style_class_name('tophat-chart-label-now');
      this.lm.attach(this.xLabelNow, 1, 2, 1, 1);

      const label = new St.Label({ text: '' });
      this.lm.attach(label, 2, 2, 1, 1);
    }

    public override destroy() {
      this.grid.destroy();
      super.destroy();
    }
  }
);

export type HistoryChart = InstanceType<typeof HistoryChart>;
