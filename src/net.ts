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
import NM from 'gi://NM';

import {
  ExtensionMetadata,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { Vitals } from './vitals.js';
import { TopHatMonitor, MeterNoVal } from './monitor.js';
import { bytesToHumanString, roundMax } from './helpers.js';
import { HistoryChart, HistoryStyle } from './history.js';

export const NetMonitor = GObject.registerClass(
  class NetMonitor extends TopHatMonitor {
    private valueNetUp: St.Label;
    private valueNetDown: St.Label;
    private menuNetUp: St.Label;
    private menuNetDown: St.Label;
    private menuNetUpTotal: St.Label;
    private menuNetDownTotal: St.Label;
    private usageUnit;
    private nmClient?: NM.Client;
    private connectivity?: NM.ConnectivityState;
    private connectivitySig = 0;

    constructor(metadata: ExtensionMetadata, gsettings: Gio.Settings) {
      super('Net Monitor', metadata, gsettings);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/hicolor/scalable/actions/net-icon-symbolic.svg`
      );
      this.icon.set_gicon(gicon);
      this.icon.add_style_class_name('tophat-panel-icon-net');

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
      this.historyChart = new HistoryChart(HistoryStyle.DUAL);

      this.gsettings.bind(
        'show-net',
        this,
        'visible',
        Gio.SettingsBindFlags.GET
      );
      this.usageUnit = this.gsettings.get_string('network-usage-unit');
      this.gsettings.connect('changed::network-usage-unit', (settings) => {
        this.usageUnit = settings.get_string('network-usage-unit');
        let s = bytesToHumanString(0, this.usageUnit) + '/s';
        this.valueNetUp.text = s;
        this.menuNetUp.text = s;
        s = bytesToHumanString(0, this.usageUnit) + '/s';
        this.valueNetDown.text = s;
        this.menuNetDown.text = s;
      });
      this.buildMenu();
      this.addMenuButtons();
      this.updateColor();

      NM.Client.new_async(null, (obj, result) => {
        if (!obj) {
          console.error('[TopHat] obj is null');
          return;
        }
        const client = NM.Client.new_finish(result);
        if (!client) {
          console.error('[TopHat] client is null');
          return;
        }
        client.check_connectivity_async(null, (client, result) => {
          this.updateConnectivity(client, result);
        });
        this.connectivitySig = client.connect('notify::connectivity', () => {
          client.check_connectivity_async(null, (client, result) => {
            this.updateConnectivity(client, result);
          });
        });
        this.nmClient = client;
      });
    }

    private updateConnectivity(
      client: NM.Client | null,
      result: Gio.AsyncResult
    ) {
      if (!client) {
        return;
      }
      this.connectivity = client.check_connectivity_finish(result);
      if (this.connectivity === NM.ConnectivityState.NONE) {
        this.valueNetUp.add_style_class_name('tophat-panel-inactive');
        this.valueNetDown.add_style_class_name('tophat-panel-inactive');
        this.menuNetDown.text = '--';
        this.menuNetUp.text = '--';
        this.valueNetDown.text = '--';
        this.valueNetUp.text = '--';
      } else {
        this.valueNetDown.remove_style_class_name('tophat-panel-inactive');
        this.valueNetUp.remove_style_class_name('tophat-panel-inactive');
        const s = bytesToHumanString(0, this.usageUnit) + '/s';
        this.menuNetDown.text = s;
        this.menuNetUp.text = s;
        this.valueNetDown.text = s;
        this.valueNetUp.text = s;
      }
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
      this.menuNetDownTotal.add_style_class_name('menu-value menu-section-end');
      this.addMenuRow(this.menuNetDownTotal, 1, 1, 1);

      if (this.historyChart) {
        this.addMenuRow(this.historyChart, 0, 2, 1);
      }
    }

    public override bindVitals(vitals: Vitals): void {
      super.bindVitals(vitals);

      let id = vitals.connect('notify::net-sent', () => {
        // console.log(`net-sent: ${vitals.net_sent}`);
        if (this.connectivity === NM.ConnectivityState.NONE) {
          return;
        }
        const s = bytesToHumanString(vitals.net_sent, this.usageUnit) + '/s';
        this.valueNetUp.text = s;
        this.menuNetUp.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::net-recv', () => {
        // console.log(`net-recv: ${vitals.net_recv}`);
        if (this.connectivity === NM.ConnectivityState.NONE) {
          return;
        }
        const s = bytesToHumanString(vitals.net_recv, this.usageUnit) + '/s';
        this.valueNetDown.text = s;
        this.menuNetDown.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::net-sent-total', () => {
        // console.log(`net-sent-total: ${vitals.net_sent_total}`);
        const s = bytesToHumanString(vitals.net_sent_total);
        this.menuNetUpTotal.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::net-recv-total', () => {
        // console.log(`net-recv-total: ${vitals.net_recv_total}`);
        const s = bytesToHumanString(vitals.net_recv_total);
        this.menuNetDownTotal.text = s;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::net-history', () => {
        if (!this.historyChart) {
          console.warn('[TopHat] Network history chart does not exist');
          return;
        }
        const history = vitals.getNetActivity();
        let max = 0;
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
        const maxLabel = bytesToHumanString(max, this.usageUnit) + '/s';
        this.historyChart.setYLabelBottom(maxLabel);
        this.historyChart.setYLabelMiddle('0');
        this.historyChart.setYLabelTop(maxLabel);
        this.historyChart.updateAlt(history, max);
      });
      this.vitalsSignals.push(id);
    }

    public override destroy() {
      // console.log('NetMonitor.destroy()');
      if (this.connectivitySig > 0) {
        this.nmClient?.disconnect(this.connectivitySig);
        this.connectivitySig = 0;
      }
      this.nmClient = undefined;
      super.destroy();
    }
  }
);

export type NetMonitor = InstanceType<typeof NetMonitor>;
