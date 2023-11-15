'use strict';

// Copyright (C) 2022 Todd Kulesza <todd@dropline.net>

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

/* global global */

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const MENU_COLUMNS = 2;
const ANIMATION_DURATION = 500;

// Re-implement GNOME Shell's PanelMenuButton class, with minor changes to
// support adding it to a container
export var TopHatMonitor = GObject.registerClass({
    Properties: {
        'meter-bar-width': GObject.ParamSpec.double(
            'meter-bar-width',
            'Meter bar width',
            "The width for each meter bar in 'em's",
            GObject.ParamFlags.READWRITE,
            0, 10,
            1
        ),
        'meter-fg-color': GObject.ParamSpec.string(
            'meter-fg-color',
            'Meter foreground color',
            'A hex value representing the color to use to draw the meter bars',
            GObject.ParamFlags.READWRITE,
            '#ffffff'
        ),
        'refresh-rate': GObject.ParamSpec.string(
            'refresh-rate',
            'How frequently the monitor will refresh system resource usage',
            'How frequently the monitor will refresh system resource usage. One of "slow", "medium", or "fast".',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'show-animation': GObject.ParamSpec.boolean(
            'show-animation',
            'Show animation',
            'True if the meter should animate',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'visualization': GObject.ParamSpec.string(
            'visualization',
            'How to visualize the monitor',
            'How to visualize the monitor. One of "chart", "numeric", or "both".',
            GObject.ParamFlags.READWRITE,
            ''
        ),
    },
    Signals: {'menu-set': {}},
}, class TopHatMonitorBase extends St.Widget {
    _init(name) {
        super._init({
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: 'tophat-monitor panel-button',
            accessible_name: name,
            accessible_role: Atk.Role.MENU,
            x_expand: true,
            y_expand: true,

        });
        this.name = name;
        this._delegate = this;
        this._signals = [];

        let hbox = new St.BoxLayout();
        this.add_child(hbox);
        this.box = hbox;
        this.meter = null;
        this.usage = null;
        this.activityBox = null;

        this.connect('style-changed', this._onStyleChanged.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));

        this._minHPadding = this._natHPadding = 0.0;

        this.setMenu(new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP, 0));
        this.buildMenuBase();
    }

    get show_animation() {
        if (this._show_animation === undefined) {
            this._show_animation = false;
        }
        return this._show_animation;
    }

    set show_animation(value) {
        if (this.show_animation === value) {
            return;
        }
        this._show_animation = value;
        this.toggleAnimation();
        this.notify('show-animation');
    }

    get meter_fg_color() {
        return this._meter_fg_color;
    }

    set meter_fg_color(value) {
        if (this._meter_fg_color === value) {
            return;
        }
        this._meter_fg_color = value;
        if (this.meter) {
            this.meter.setColor(value);
        }
        this.notify('meter-fg-color');
    }

    get meter_bar_width() {
        if (this._meter_bar_width === undefined) {
            this._meter_bar_width = 0.6;
        }
        return this._meter_bar_width;
    }

    set meter_bar_width(value) {
        if (this._meter_bar_width === value) {
            return;
        }
        this._meter_bar_width = value;
        if (this.meter) {
            this.meter.updateBarWidth(value);
        }
        this.notify('meter-bar-width');
    }

    get refresh_rate() {
        if (this._refresh_rate === undefined) {
            this._refresh_rate = 'normal';
        }
        return this._refresh_rate;
    }

    set refresh_rate(value) {
        if (this._refresh_rate === value) {
            return;
        }
        this._refresh_rate = value;
        this.notify('refresh-rate');
    }

    get visualization() {
        if (this._visualizationType === undefined) {
            this._visualizationType = 'chart';
        }
        return this._visualizationType;
    }

    set visualization(value) {
        if (this._visualizationType === value) {
            return;
        }
        this._visualizationType = value;
        this.updateVisualization();
        this.notify('visualization');
    }

    get role() {
        return `TopHat ${this.name}`;
    }

    refresh() {
        // Override this in child classes to refresh resource consumption/activity
        console.error('Must override Monitor.refresh()');
    }

    toggleAnimation() {
        if (!this.meter) {
            return;
        }

        if (this._show_animation) {
            this.meter.enable_animation();
        } else {
            this.meter.disable_animation();
        }
    }

    setMeter(meter) {
        if (this.meter) {
            this.meter.destroy();
        }
        this.meter = meter;
        if (this.meter) {
            // Ensure the usage label follows after the meter...
            if (this.usage) {
                this.box.remove_child(this.usage);
            }
            // ... and the activity box follows after them
            if (this.activityBox) {
                this.box.remove_child(this.activityBox);
            }
            this.meter.setColor(this.meter_fg_color);
            this.add_child(this.meter);
            this.meter.updateBarWidth(this._meter_bar_width);
            if (this.usage) {
                this.add_child(this.usage);
            }
            if (this.activityBox) {
                this.add_child(this.activityBox);
            }
            this.updateVisualization();
            this.toggleAnimation();
        }
    }

    setMenu(menu) {
        if (this.menu) {
            this.menu.destroy();
        }

        this.menu = menu;
        if (this.menu) {
            this.menu.actor.add_style_class_name('panel-menu');
            this.menu.connect('open-state-changed', this._onOpenStateChanged.bind(this));
            this.menu.actor.connect('key-press-event', this._onMenuKeyPress.bind(this));

            Main.uiGroup.add_actor(this.menu.actor);
            this.menu.actor.hide();
        }
        this.emit('menu-set');
    }

    updateVisualization() {
        if (this.monitor_mode === 'activity') {
            if (this.meter) {
                this.meter.visible = false;
            }
            if (this.usage) {
                this.usage.visible = false;
            }
            return;
        }

        switch (this.visualization) {
        case 'chart':
            if (this.meter) {
                this.meter.visible = true;
            }
            if (this.usage) {
                this.usage.visible = false;
            }
            break;
        case 'numeric':
            if (this.meter) {
                this.meter.visible = false;
            }
            if (this.usage) {
                this.usage.visible = true;
            }
            break;
        case 'both':
            if (this.meter) {
                this.meter.visible = true;
            }
            if (this.usage) {
                this.usage.visible = true;
            }
            break;
        }
    }

    buildMenuBase() {
        if (!this.menu) {
            return;
        }

        let statusMenu = new PopupMenu.PopupMenuSection();
        let grid = new St.Widget({
            style_class: 'menu-grid',
            layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        });
        this.lm = grid.layout_manager;
        this.menuRow = 0;
        this.menuCol = 0;
        this.numMenuCols = MENU_COLUMNS;
        statusMenu.box.add_child(grid);
        this.menu.addMenuItem(statusMenu);
    }

    buildMenuButtons() {
        if (!this.menu) {
            return;
        }

        let box = new St.BoxLayout({
            style_class: 'tophat-menu-button-box',
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            x_expand: true,
        });

        // System Monitor
        let appSys = Shell.AppSystem.get_default();
        let app = appSys.lookup_app('gnome-system-monitor.desktop');
        if (app) {
            let button = new St.Button({style_class: 'button'});
            button.child = new St.Icon({
                icon_name: 'utilities-system-monitor-symbolic',
                fallback_icon_name: 'org.gnome.SystemMonitor-symbolic',
            });

            button.connect('clicked', () => {
                this.menu.close(true);
                app.activate();
            });
            box.add_child(button);
        }

        // TopHat preferences
        let button = new St.Button({style_class: 'button'});
        button.child = new St.Icon({
            icon_name: 'preferences-system-symbolic',
        });
        button.connect('clicked', () => {
            this.menu.close(true);
            try {
                let obj = Extension.lookupByUUID('tophat@fflewddur.github.io');
                obj.openPreferences();
            } catch (err) {
                log(`[TopHat] Error opening settings: ${err}`);
            }
        });
        box.add_child(button);

        this.addMenuRow(box, 0, this.numMenuCols, 1);
    }

    addMenuRow(widget, col, colSpan, rowSpan) {
        this.lm.attach(widget, col, this.menuRow, colSpan, rowSpan);
        this.menuCol += colSpan;
        if (this.menuCol >= this.numMenuCols) {
            this.menuRow++;
            this.menuCol = 0;
        }
    }

    computeSummaryUpdateInterval(baseInterval) {
        let interval = baseInterval;
        switch (this.refresh_rate) {
        case 'slowest':
            interval *= 4;
            break;
        case 'slow':
            interval *= 2;
            break;
        case 'medium':
            break;
        case 'fast':
            interval /= 2;
            break;
        case 'fastest':
            interval /= 4;
        }
        return interval;
    }

    computeDetailsUpdateInterval(baseInterval) {
        let interval = baseInterval;
        switch (this.refresh_rate) {
        case 'slowest':
            interval *= 2;
            break;
        case 'slow':
            interval *= 1.5;
            break;
        case 'medium':
            break;
        case 'fast':
            interval /= 1.5;
            break;
        case 'fastest':
            interval /= 2;
        }
        return interval;
    }

    add_child(child) {
        if (this.box) {
            this.box.add_child(child);
        } else {
            super.add_child(child);
        }
    }

    vfunc_event(event) {
        if (this.menu &&
            (event.type() === Clutter.EventType.TOUCH_BEGIN ||
             event.type() === Clutter.EventType.BUTTON_PRESS)) {
            this.menu.toggle();
        }

        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_hide() {
        super.vfunc_hide();

        if (this.menu) {
            this.menu.close();
        }
    }

    _onMenuKeyPress(actor, event) {
        if (global.focus_manager.navigate_from_event(event)) {
            return Clutter.EVENT_STOP;
        }

        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Left || symbol === Clutter.KEY_Right) {
            let group = global.focus_manager.get_group(this);
            if (group) {
                let direction = symbol === Clutter.KEY_Left ? St.DirectionType.LEFT : St.DirectionType.RIGHT;
                group.navigate_focus(this, direction, false);
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onOpenStateChanged(menu, open) {
        if (open) {
            this.add_style_pseudo_class('active');
        } else {
            this.remove_style_pseudo_class('active');
        }

        // Setting the max-height won't do any good if the minimum height of the
        // menu is higher then the screen; it's useful if part of the menu is
        // scrollable so the minimum height is smaller than the natural height
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let verticalMargins = this.menu.actor.margin_top + this.menu.actor.margin_bottom;

        // The workarea and margin dimensions are in physical pixels, but CSS
        // measures are in logical pixels, so make sure to consider the scale
        // factor when computing max-height
        let maxHeight = Math.round((workArea.height - verticalMargins) / scaleFactor);
        this.menu.actor.style = `max-height: ${maxHeight}px;`;
    }

    _onStyleChanged(actor) {
        let themeNode = actor.get_theme_node();

        this._minHPadding = themeNode.get_length('-minimum-hpadding');
        this._natHPadding = themeNode.get_length('-natural-hpadding');
    }

    vfunc_get_preferred_width(_forHeight) {
        let child = this.get_first_child();
        let minimumSize, naturalSize;

        if (child) {
            [minimumSize, naturalSize] = child.get_preferred_width(-1);
        } else {
            minimumSize = naturalSize = 0;
        }

        minimumSize += 2 * this._minHPadding;
        naturalSize += 2 * this._natHPadding;

        return [minimumSize, naturalSize];
    }

    vfunc_get_preferred_height(_forWidth) {
        let child = this.get_first_child();

        if (child) {
            return child.get_preferred_height(-1);
        }

        return [0, 0];
    }

    vfunc_allocate(box) {
        this.set_allocation(box);

        let child = this.get_first_child();
        if (!child) {
            return;
        }

        let [, natWidth] = child.get_preferred_width(-1);

        let availWidth = box.x2 - box.x1;
        let availHeight = box.y2 - box.y1;

        let childBox = new Clutter.ActorBox();
        if (natWidth + 2 * this._natHPadding <= availWidth) {
            childBox.x1 = this._natHPadding;
            childBox.x2 = availWidth - this._natHPadding;
        } else {
            childBox.x1 = this._minHPadding;
            childBox.x2 = availWidth - this._minHPadding;
        }

        childBox.y1 = 0;
        childBox.y2 = availHeight;

        child.allocate(childBox);
    }

    _onDestroy() {
        if (this.menu) {
            this.menu.destroy();
        }
        if (this.meter) {
            this.meter.destroy();
        }
        this._signals.forEach(id => this.disconnect(id));
        this._signals = [];
    }
});

export var Meter = GObject.registerClass({
}, class TopHatMeter extends St.BoxLayout {
    _init(numBars = 1, width) {
        super._init({style_class: 'tophat-meter', y_align: Clutter.ActorAlign.CENTER, y_expand: true});
        this.barWidth = this.computeBarWidth(numBars, width);
        let bars = new Array(numBars);
        for (let i = 0; i < numBars; i++) {
            let bar = new St.Widget(
                {
                    style_class: 'tophat-meter-bar',
                    y_align: Clutter.ActorAlign.END,
                    y_expand: false,
                    style: `height:1px;width:${this.barWidth}em;background-color:${this.meterFGColor};`,
                });
            bars[i] = bar;
            this.add_child(bars[i]);
        }
        this.bars = bars;
        this.meterFGColor = null;
        this.animationTimer = 0;
        this.easingSet = false;
        let themeContext = St.ThemeContext.get_for_stage(global.get_stage());
        if (themeContext.get_scale_factor) {
            this.scaleFactor = themeContext.get_scale_factor();
            themeContext.connect('notify::scale-factor', obj => {
                this.scaleFactor = obj.get_scale_factor();
            });
        } else {
            this.scaleFactor = 1;
        }
    }

    setUsage(usage) {
        // FIXME: Cache the meter's height (and listen for changes)
        let [, height] = this.get_size();
        for (let i = 0; i < usage.length; i++) {
            let fillHeight = Math.ceil(usage[i] / 100.0 * height) / this.scaleFactor;
            if (isNaN(fillHeight)) {
                fillHeight = 0;
            }
            let style = `height:${fillHeight}px;width:${this.barWidth}em;background-color:${this.meterFGColor};`;
            this.bars[i].set_style(style);
        }
    }

    computeBarWidth(numBars, width) {
        if (numBars > 8) {
            width *= .5; // Reduce bar width by half when there are many bars
        } else if (numBars > 2) {
            width *= .75; // Reduce bar width by 3/4 when there are a few bars
        }
        return width;
    }

    updateBarWidth(width) {
        if (this.bars) {
            width = this.computeBarWidth(this.bars.length, width);
            this.barWidth = width;
        }
    }

    enable_animation() {
        if (this.animationTimer !== 0) {
            GLib.source_remove(this.animationTimer);
            this.animationTimer = 0;
        }
        if (!this.is_realized()) {
            // Wait until the widget is realized, to avoid stuttering during initial layout
            this.animationTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => this.enable_animation());
            return;
        }
        if (!this.easingSet) {
            this.bars.forEach(bar => {
                bar.save_easing_state();
                bar.set_easing_duration(ANIMATION_DURATION);
            });
            this.easingSet = true;
        }
    }

    disable_animation() {
        if (this.easingSet) {
            this.bars.forEach(bar => {
                bar.restore_easing_state();
            });
            this.easingSet = false;
        }
    }

    setColor(value) {
        this.meterFGColor = value;
    }

    destroy() {
        if (this.animationTimer !== 0) {
            GLib.source_remove(this.animationTimer);
            this.animationTimer = 0;
        }
        super.destroy();
    }
});
