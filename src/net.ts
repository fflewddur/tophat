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
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {
  ExtensionMetadata,
  gettext as _,
  ngettext,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { MaxHistoryLen, SummaryInterval, Vitals } from './vitals.js';
import { TopHatMeter, MeterNoVal } from './meter.js';
import { bytesToHumanString, roundMax } from './helpers.js';

export const NetMonitor = GObject.registerClass(
  class NetMonitor extends TopHatMeter {
    private icon;
    private valueNetUp: St.Label;
    private valueNetDown: St.Label;
    private menuNetUp: St.Label;
    private menuNetDown: St.Label;
    private menuNetUpTotal: St.Label;
    private menuNetDownTotal: St.Label;
    private menuHistGrid: St.Widget;
    private histBarsIn: St.Widget[];
    private histBarsOut: St.Widget[];
    private histLabelIn: St.Label;
    private histLabelOut: St.Label;

    constructor(metadata: ExtensionMetadata) {
      super('Net Monitor', metadata);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/net-icon-symbolic.svg`
      );
      this.icon = new St.Icon({
        gicon,
        style_class:
          'system-status-icon tophat-panel-icon tophat-panel-icon-net',
      });
      this.add_child(this.icon);

      const vbox = new St.BoxLayout({ vertical: true });
      vbox.connect('notify::vertical', (obj) => {
        obj.vertical = true;
      });
      this.add_child(vbox);

      const valueNetUp = new St.Label({
        text: MeterNoVal,
        style_class: 'tophat-panel-usage-stacked',
        y_expand: true,
        y_align: Clutter.ActorAlign.END,
      });
      vbox.add_child(valueNetUp);
      this.valueNetUp = valueNetUp;
      const valueNetDown = new St.Label({
        text: MeterNoVal,
        style_class: 'tophat-panel-usage-stacked',
        y_expand: true,
        y_align: Clutter.ActorAlign.START,
      });
      vbox.add_child(valueNetDown);
      this.valueNetDown = valueNetDown;

      this.menuNetUp = new St.Label();
      this.menuNetDown = new St.Label();
      this.menuNetUpTotal = new St.Label();
      this.menuNetDownTotal = new St.Label();

      this.menuHistGrid = new St.Widget({
        layout_manager: new Clutter.GridLayout({
          orientation: Clutter.Orientation.VERTICAL,
        }),
      });
      this.histLabelOut = new St.Label({
        text: _('Send'),
        y_align: Clutter.ActorAlign.START,
        style_class: 'chart-label',
      });
      this.histBarsOut = new Array<St.Widget>(MaxHistoryLen);
      for (let i = 0; i < MaxHistoryLen; i++) {
        this.histBarsOut[i] = new St.Widget({
          x_expand: true,
          y_expand: false,
          y_align: Clutter.ActorAlign.END,
          style_class: 'chart-bar chart-bar-alt',
          height: 0,
        });
      }
      this.histLabelIn = new St.Label({
        text: _('Recv'),
        y_align: Clutter.ActorAlign.END,
        style_class: 'chart-label',
      });
      this.histBarsIn = new Array<St.Widget>(MaxHistoryLen);
      for (let i = 0; i < MaxHistoryLen; i++) {
        this.histBarsIn[i] = new St.Widget({
          x_expand: true,
          y_expand: false,
          y_align: Clutter.ActorAlign.START,
          style_class: 'chart-bar',
          height: 0,
        });
      }

      this.buildMenu();
      this.addMenuButtons();
    }

    private buildMenu() {
      let label = new St.Label({
        text: _('Network activity'),
        style_class: 'menu-header',
      });
      this.addMenuRow(label, 0, 2, 1);

      label = new St.Label({
        text: _('Sending:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuNetUp.text = MeterNoVal;
      this.menuNetUp.add_style_class_name('menu-value');
      this.addMenuRow(this.menuNetUp, 1, 1, 1);

      label = new St.Label({
        text: _('Receiving:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuNetDown.text = MeterNoVal;
      this.menuNetDown.add_style_class_name('menu-value menu-section-end');
      this.addMenuRow(this.menuNetDown, 1, 1, 1);

      label = new St.Label({
        text: _('Total sent:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuNetUpTotal.text = MeterNoVal;
      this.menuNetUpTotal.add_style_class_name('menu-value');
      this.addMenuRow(this.menuNetUpTotal, 1, 1, 1);

      label = new St.Label({
        text: _('Total received:'),
        style_class: 'menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuNetDownTotal.text = MeterNoVal;
      this.menuNetDownTotal.add_style_class_name('menu-value');
      this.addMenuRow(this.menuNetDownTotal, 1, 1, 1);

      // Add the grid layout for the history chart
      this.addMenuRow(this.menuHistGrid, 0, 2, 1);
      const lm = this.menuHistGrid.layout_manager as Clutter.GridLayout;
      const chartOut = new St.BoxLayout({
        style_class: 'chart chart-stacked-top',
      });
      lm.attach(chartOut, 0, 0, 2, 2);
      for (const bar of this.histBarsOut) {
        chartOut.add_child(bar);
      }
      const chartIn = new St.BoxLayout({
        style_class: 'chart chart-stacked-bottom',
      });
      lm.attach(chartIn, 0, 2, 2, 2);
      for (const bar of this.histBarsIn) {
        chartIn.add_child(bar);
      }

      lm.attach(this.histLabelOut, 2, 0, 1, 1);
      label = new St.Label({
        text: '0',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'chart-label',
      });
      lm.attach(label, 2, 1, 1, 2);
      lm.attach(this.histLabelIn, 2, 3, 1, 1);
      const limitInMins = (MaxHistoryLen * SummaryInterval) / 60;
      const startLabel = ngettext(
        '%d min ago',
        '%d mins ago',
        limitInMins
      ).format(limitInMins);
      label = new St.Label({
        text: startLabel,
        style_class: 'chart-label-then',
      });
      lm.attach(label, 0, 4, 1, 1);
      label = new St.Label({ text: _('now'), style_class: 'chart-label-now' });
      lm.attach(label, 1, 4, 1, 1);
    }

    public override bindVitals(vitals: Vitals): void {
      vitals.connect('notify::net-sent', () => {
        const s = bytesToHumanString(vitals.net_sent);
        this.valueNetUp.text = s;
        this.menuNetUp.text = s;
      });
      vitals.connect('notify::net-recv', () => {
        const s = bytesToHumanString(vitals.net_recv);
        this.valueNetDown.text = s;
        this.menuNetDown.text = s;
      });
      vitals.connect('notify::net-sent-total', () => {
        const s = bytesToHumanString(vitals.net_sent_total);
        this.menuNetUpTotal.text = s;
      });
      vitals.connect('notify::net-recv-total', () => {
        const s = bytesToHumanString(vitals.net_recv_total);
        this.menuNetDownTotal.text = s;
      });
      vitals.connect('notify::net-history', () => {
        const history = vitals.getNetActivity();
        let max = 0.001; // A very small value to prevent division by 0
        for (const na of history) {
          if (!na) {
            break;
          }
          if (na.bytesRecv > max) {
            max = na.bytesRecv;
          }
          if (na.bytesSent > max) {
            max = na.bytesSent;
          }
        }
        max = roundMax(max);
        const maxLabel = bytesToHumanString(max) + '/s';
        this.histLabelIn.text = maxLabel;
        this.histLabelOut.text = maxLabel;
        const chartOutHeight = this.histBarsOut[0].get_parent()?.height;
        const chartInHeight = this.histBarsIn[0].get_parent()?.height;
        if (!chartOutHeight || !chartInHeight) {
          return;
        }
        for (let i = 0; i < this.histBarsOut.length; i++) {
          this.histBarsOut[i].height =
            chartOutHeight * (history[history.length - i - 1].bytesSent / max);
          this.histBarsIn[i].height =
            chartInHeight * (history[history.length - i - 1].bytesRecv / max);
        }
      });
    }
  }
);

export type NetMonitor = InstanceType<typeof NetMonitor>;
