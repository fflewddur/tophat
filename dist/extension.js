// TopHat: An elegant system resource monitor for the GNOME shell
// Copyright (C) 2020 Todd Kulesza <todd@dropline.net>
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { File } from './file.js';
import { Vitals, CpuModel } from './vitals.js';
import { TopHatContainer } from './container.js';
import { CpuMonitor } from './cpu.js';
import { MemMonitor } from './mem.js';
import { DiskMonitor } from './disk.js';
import { NetMonitor } from './net.js';
var MenuPosition;
(function (MenuPosition) {
    MenuPosition[MenuPosition["LeftEdge"] = 0] = "LeftEdge";
    MenuPosition[MenuPosition["Left"] = 1] = "Left";
    MenuPosition[MenuPosition["Center"] = 2] = "Center";
    MenuPosition[MenuPosition["Right"] = 3] = "Right";
    MenuPosition[MenuPosition["RightEdge"] = 4] = "RightEdge";
})(MenuPosition || (MenuPosition = {}));
export default class TopHat extends Extension {
    gsettings;
    signals = new Array();
    vitals;
    container;
    enable() {
        this.gsettings = this.getSettings();
        const f = new File('/proc/cpuinfo');
        const cpuModel = this.parseCpuOverview(f.readSync());
        this.vitals = new Vitals(cpuModel, this.gsettings);
        this.vitals.start();
        this.addToPanel();
        const id = this.gsettings.connect('changed::position-in-panel', () => {
            this.addToPanel();
        });
        this.signals.push(id);
    }
    disable() {
        this.container?.destroy();
        this.container = undefined;
        this.signals.forEach((s) => {
            this.gsettings?.disconnect(s);
        });
        this.signals.length = 0;
        this.gsettings = undefined;
        this.vitals?.stop();
        this.vitals = undefined;
    }
    parseCpuOverview(cpuinfo) {
        const cpus = new Set();
        const tempMonitors = new Map();
        // Count the number of physical CPUs
        const blocks = cpuinfo.split('\n\n');
        for (const block of blocks) {
            const m = block.match(/physical id\s*:\s*(\d+)/);
            if (m) {
                const id = parseInt(m[1]);
                cpus.add(id);
            }
        }
        const cores = blocks.length;
        // Find the temperature sensor for each CPU
        const base = '/sys/class/hwmon/';
        const hwmon = new File(base);
        hwmon.listSync().forEach((filename) => {
            // TODO: Add unit tests for each known temperature sensor configuration
            const name = new File(`${base}${filename}/name`).readSync();
            if (name === 'coretemp') {
                // Intel CPUs
                let f = new File(`${base}${filename}/temp1_label`);
                if (!f.exists()) {
                    // To support Intel Core systems pre-Sandybridge
                    f = new File(`${base}${filename}/temp2_label`);
                }
                if (!f.exists()) {
                    console.error(`[TopHat] Found coretemp but no sensor labels`);
                    return;
                }
                const prefix = f.readSync();
                // const prefix = new File(`${base}${filename}/temp1_label`)
                let id = 0;
                if (prefix) {
                    const m = prefix.match(/Package id\s*(\d+)/);
                    if (m) {
                        id = parseInt(m[1]);
                    }
                }
                let inputPath = `${base}${filename}/temp1_input`;
                if (new File(inputPath).exists()) {
                    tempMonitors.set(id, inputPath);
                }
                else {
                    // To support Intel Core systems pre-Sandybridge
                    inputPath = `${base}${filename}/temp2_input`;
                    if (new File(inputPath).exists()) {
                        tempMonitors.set(id, inputPath);
                    }
                    else {
                        console.error(`[TopHat] Found coretemp but no sensor inputs`);
                        return;
                    }
                }
            }
            else if (name === 'k10temp') {
                // AMD CPUs
                // temp2 is Tdie, temp1 is Tctl
                let inputPath = `${base}${filename}/temp2_input`;
                if (!new File(inputPath).exists()) {
                    inputPath = `${base}${filename}/temp1_input`;
                    if (!new File(inputPath).exists()) {
                        console.error(`[TopHat] Found k10temp but no sensor inputs`);
                        return;
                    }
                }
                tempMonitors.set(0, inputPath);
            }
            else if (name === 'zenpower') {
                // AMD CPUs w/ alternate kernel driver
                // temp1 is Tdie, temp2 is Tctl
                let inputPath = `${base}${filename}/temp1_input`;
                if (!new File(inputPath).exists()) {
                    inputPath = `${base}${filename}/temp2_input`;
                    if (!new File(inputPath).exists()) {
                        console.error(`[TopHat] Found zenpower but no sensor inputs`);
                        return;
                    }
                }
                tempMonitors.set(0, inputPath);
            }
        });
        // Get the model name
        const lines = cpuinfo.split('\n');
        const modelRE = /^model name\s*:\s*(.*)$/;
        let model = '';
        for (const line of lines) {
            const m = !model && line.match(modelRE);
            if (m) {
                model = m[1];
                break;
            }
        }
        return new CpuModel(model, cores, cpus.size, tempMonitors);
    }
    addToPanel() {
        if (!this.gsettings) {
            console.warn('[TopHat] error in addToPanel(): gsettings does not exist');
            return;
        }
        this.container?.destroy();
        this.container = new TopHatContainer(0.5, 'TopHat');
        this.container.addMonitor(new CpuMonitor(this.metadata, this.gsettings));
        this.container.addMonitor(new MemMonitor(this.metadata, this.gsettings));
        this.container.addMonitor(new DiskMonitor(this.metadata, this.gsettings));
        this.container.addMonitor(new NetMonitor(this.metadata, this.gsettings));
        const pref = this.getPreferredPanelAttributes();
        this.container = Main.panel.addToStatusArea('TopHat', this.container, pref.position, pref.box);
        this.container?.monitors.forEach((m) => {
            if (this.vitals) {
                m.bindVitals(this.vitals);
                Main.panel._onMenuSet(m);
            }
        });
        // Trigger notifications for properties that were set during init and will not change
        this.vitals?.notify('cpu-model');
        this.vitals?.notify('summary-interval');
    }
    getPreferredPanelAttributes() {
        let box = 'right';
        let position = 0;
        switch (this.gsettings?.get_enum('position-in-panel')) {
            case MenuPosition.LeftEdge:
                box = 'left';
                position = 0;
                break;
            case MenuPosition.Left:
                box = 'left';
                position = -1;
                break;
            case MenuPosition.Center:
                box = 'center';
                position = 1;
                break;
            case MenuPosition.Right:
                box = 'right';
                position = 0;
                break;
            case MenuPosition.RightEdge:
                box = 'right';
                position = -1;
                break;
            default:
                console.warn('[TopHat] Unknown value for position-in-panel');
        }
        return { box, position };
    }
}
