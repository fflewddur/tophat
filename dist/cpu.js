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
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { gettext as _, ngettext, } from 'resource:///org/gnome/shell/extensions/extension.js';
import { TopHatMonitor, MeterNoVal, NumTopProcs, TopProc } from './monitor.js';
import { Orientation } from './meter.js';
import { HistoryChart } from './history.js';
import { DisplayType, getDisplayTypeSetting } from './helpers.js';
import { CapacityBar } from './capacity.js';
export const CpuMonitor = GObject.registerClass(class CpuMonitor extends TopHatMonitor {
    usage;
    menuCpuUsage;
    menuCpuCap;
    menuCpuModel;
    menuCpuFreq;
    menuCpuTemp;
    menuUptime;
    topProcs;
    showCores;
    sortCores;
    normalizeProcUsage;
    displayType;
    constructor(metadata, gsettings) {
        super('CPU Monitor', metadata, gsettings);
        const gicon = Gio.icon_new_for_string(`${this.metadata.path}/icons/hicolor/scalable/actions/cpu-icon-symbolic.svg`);
        this.icon.set_gicon(gicon);
        this.usage = new St.Label({
            text: MeterNoVal,
            style_class: 'tophat-panel-usage tophat-panel-usage-wider',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.usage);
        this.meter.setNumBars(1);
        this.meter.setOrientation(Orientation.Vertical);
        this.add_child(this.meter);
        this.menuCpuUsage = new St.Label();
        this.menuCpuCap = new CapacityBar();
        this.menuCpuModel = new St.Label();
        this.menuCpuFreq = new St.Label();
        this.menuCpuTemp = new St.Label();
        this.menuUptime = new St.Label();
        this.historyChart = new HistoryChart();
        this.topProcs = new Array(NumTopProcs);
        for (let i = 0; i < NumTopProcs; i++) {
            this.topProcs[i] = new TopProc();
        }
        this.showCores = this.gsettings.get_boolean('cpu-show-cores');
        let id = this.gsettings.connect('changed::cpu-show-cores', (settings) => {
            this.showCores = settings.get_boolean('cpu-show-cores');
            if (!this.showCores) {
                this.meter.setNumBars(1);
            }
        });
        this.settingsSignals.push(id);
        this.sortCores = this.gsettings.get_boolean('cpu-sort-cores');
        id = this.gsettings.connect('changed::cpu-sort-cores', (settings) => {
            this.sortCores = settings.get_boolean('cpu-sort-cores');
        });
        this.settingsSignals.push(id);
        this.normalizeProcUsage = this.gsettings.get_boolean('cpu-normalize-proc-use');
        id = this.gsettings.connect('changed::cpu-normalize-proc-use', (settings) => {
            this.normalizeProcUsage = settings.get_boolean('cpu-normalize-proc-use');
        });
        this.settingsSignals.push(id);
        this.displayType = this.updateDisplayType();
        id = this.gsettings.connect('changed::cpu-display', () => {
            this.updateDisplayType();
        });
        this.settingsSignals.push(id);
        this.visible = gsettings.get_boolean('show-cpu');
        id = this.gsettings.connect('changed::show-cpu', (settings) => {
            this.visible = settings.get_boolean('show-cpu');
        });
        this.settingsSignals.push(id);
        this.buildMenu();
        this.addMenuButtons();
        this.updateColor();
    }
    updateDisplayType() {
        this.displayType = getDisplayTypeSetting(this.gsettings, 'cpu-display');
        if (this.displayType === DisplayType.Both) {
            this.usage.show();
            this.meter.show();
        }
        else {
            if (this.displayType === DisplayType.Chart) {
                this.usage.hide();
                this.meter.show();
            }
            else {
                this.usage.show();
                this.meter.hide();
            }
        }
        return this.displayType;
    }
    buildMenu() {
        let label = new St.Label({
            text: _('Processor usage'),
            style_class: 'tophat-menu-header',
        });
        this.addMenuRow(label, 0, 2, 1);
        label = new St.Label({
            text: _('Processor utilization:'),
            style_class: 'tophat-menu-label',
        });
        this.addMenuRow(label, 0, 1, 1);
        this.menuCpuUsage.text = MeterNoVal;
        this.menuCpuUsage.add_style_class_name('tophat-menu-value');
        this.addMenuRow(this.menuCpuUsage, 1, 1, 1);
        this.menuCpuCap.add_style_class_name('tophat-menu-section-end');
        this.addMenuRow(this.menuCpuCap, 0, 2, 1);
        // TODO: if we have multiple sockets, create a section for each
        this.menuCpuModel.text = _(`model ${MeterNoVal}`);
        this.menuCpuModel.add_style_class_name('tophat-menu-label tophat-menu-details');
        this.menuCpuModel.set_x_expand(true);
        this.addMenuRow(this.menuCpuModel, 0, 2, 1);
        label = new St.Label({
            text: _('Frequency:'),
            style_class: 'tophat-menu-label tophat-menu-details',
        });
        this.addMenuRow(label, 0, 1, 1);
        this.menuCpuFreq.text = MeterNoVal;
        this.menuCpuFreq.add_style_class_name('tophat-menu-value tophat-menu-details');
        this.addMenuRow(this.menuCpuFreq, 1, 1, 1);
        label = new St.Label({
            text: _('Temperature:'),
            style_class: 'tophat-menu-label tophat-menu-details tophat-menu-section-end',
        });
        this.addMenuRow(label, 0, 1, 1);
        this.menuCpuTemp.text = MeterNoVal;
        this.menuCpuTemp.add_style_class_name('tophat-menu-value tophat-menu-details tophat-menu-section-end');
        this.addMenuRow(this.menuCpuTemp, 1, 1, 1);
        if (this.historyChart) {
            this.addMenuRow(this.historyChart, 0, 2, 1);
        }
        label = new St.Label({
            text: _('Top processes'),
            style_class: 'tophat-menu-header',
        });
        this.addMenuRow(label, 0, 2, 1);
        for (let i = 0; i < NumTopProcs; i++) {
            this.topProcs[i].cmd.set_style_class_name('tophat-menu-cmd-name');
            this.addMenuRow(this.topProcs[i].cmd, 0, 1, 1);
            this.topProcs[i].setTooltip();
            this.topProcs[i].usage.set_style_class_name('tophat-menu-cmd-usage');
            if (i === NumTopProcs - 1) {
                this.topProcs[i].usage.add_style_class_name('tophat-menu-section-end');
            }
            this.addMenuRow(this.topProcs[i].usage, 1, 1, 1);
        }
        label = new St.Label({
            text: _('System uptime'),
            style_class: 'tophat-menu-header',
        });
        this.addMenuRow(label, 0, 2, 1);
        this.menuUptime.text = MeterNoVal;
        this.menuUptime.add_style_class_name('tophat-menu-uptime tophat-menu-section-end');
        this.addMenuRow(this.menuUptime, 0, 2, 1);
    }
    bindVitals(vitals) {
        super.bindVitals(vitals);
        let id = vitals.connect('notify::cpu-usage', () => {
            // console.log(`cpu-usage: ${vitals.cpu_usage}`);
            const percent = vitals.cpu_usage * 100;
            const s = percent.toFixed(0) + '%';
            this.usage.text = s;
            this.menuCpuUsage.text = s;
            this.menuCpuCap.setUsage(percent / 100);
            if (this.showCores) {
                if (this.meter.getNumBars() === 1) {
                    this.meter.setNumBars(vitals.getCpuCoreUsage().length);
                }
                let usage = vitals.getCpuCoreUsage();
                if (this.sortCores) {
                    usage = usage.sort((a, b) => b - a);
                }
                this.meter.setBarSizes(usage);
            }
            else {
                if (this.meter.getNumBars() !== 1) {
                    this.meter.setNumBars(1);
                }
                this.meter.setBarSizes([vitals.cpu_usage]);
            }
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::cpu-model', () => {
            // console.log(`cpu-model: ${vitals.cpu_model}`);
            const s = vitals.cpu_model;
            this.menuCpuModel.text = s;
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::cpu-freq', () => {
            // console.log(`cpu-freq: ${vitals.cpu_freq}`);
            const s = vitals.cpu_freq.toFixed(1) + ' GHz';
            this.menuCpuFreq.text = s;
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::cpu-temp', () => {
            // console.log(`cpu-temp: ${vitals.cpu_temp}`);
            const s = vitals.cpu_temp.toFixed(0) + ' °C';
            this.menuCpuTemp.text = s;
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::cpu-top-procs', () => {
            const procs = vitals.getTopCpuProcs(NumTopProcs);
            // console.log(`cpu-top-procs: ${procs}`);
            for (let i = 0; i < NumTopProcs; i++) {
                if (procs[i]) {
                    let cpu = procs[i].cpuUsage();
                    if (!this.normalizeProcUsage) {
                        cpu *= vitals.cpuModel.cores;
                    }
                    if (cpu >= 0.01) {
                        this.topProcs[i].usage.text = (cpu * 100).toFixed(0) + '%';
                    }
                    else {
                        this.topProcs[i].usage.text = '< 1%';
                    }
                    this.topProcs[i].setCmd(procs[i].cmd);
                    if (procs[i].count > 1) {
                        this.topProcs[i].setCmd(this.topProcs[i].cmd.text + ` (x${procs[i].count})`);
                    }
                }
                else {
                    this.topProcs[i].setCmd('');
                    this.topProcs[i].usage.text = '';
                }
            }
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::cpu-history', () => {
            this.historyChart?.update(vitals.getCpuHistory());
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::uptime', () => {
            const s = this.formatUptime(vitals.uptime);
            this.menuUptime.text = s;
        });
        this.vitalsSignals.push(id);
    }
    formatUptime(seconds) {
        let days = 0, hours = 0, mins = 0;
        mins = Math.floor((seconds % 3600) / 60);
        hours = Math.floor((seconds % 86400) / 3600);
        days = Math.floor(seconds / 86400);
        const parts = [];
        if (days > 0) {
            parts.push(ngettext('%d day', '%d days', days).format(days));
        }
        if (days > 0 || hours > 0) {
            parts.push(ngettext('%d hour', '%d hours', hours).format(hours));
        }
        parts.push(ngettext('%d minute', '%d minutes', mins).format(mins));
        return parts.join(' ');
    }
    updateColor() {
        const [color, useAccent] = super.updateColor();
        this.menuCpuCap?.setColor(color);
        return [color, useAccent];
    }
});
