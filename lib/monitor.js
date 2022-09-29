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
/* exported TopHatMonitor, Meter */

const {Atk, Clutter, GObject, Shell, St} = imports.gi;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const _ = Config.Domain.gettext;
const MENU_COLUMNS = 2;

// Re-implement GNOME Shell's PanelMenuButton class, with minor changes to
// support adding it to a container
var TopHatMonitor = GObject.registerClass({
    Properties: {
        'show-animation': GObject.ParamSpec.boolean(
            'show-animation',
            'Show animation',
            'True if the meter should animate',
            GObject.ParamFlags.READWRITE,
            true
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

        let hbox = new St.BoxLayout();
        this.add_child(hbox);
        this.box = hbox;
        this.meter = null;

        this.connect('style-changed', this._onStyleChanged.bind(this));

        this._minHPadding = this._natHPadding = 0.0;

        this.setMenu(new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP, 0));
        this.buildMenuBase();
    }

    get show_animation() {
        return this._show_animation || false;
    }

    set show_animation(value) {
        if (this._show_animation === value) {
            return;
        }
        this._show_animation = value;
        this.toggleAnimation();
        this.notify('show-animation');
    }

    get role() {
        return `${Me.metadata.name} ${this.name}`;
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

        let button = new St.Button({style_class: 'button'});
        button.child = new St.Icon({
            icon_name: 'org.gnome.SystemMonitor-symbolic',
            icon_size: 16,
        });
        let appSys = Shell.AppSystem.get_default();
        let app = appSys.lookup_app('gnome-system-monitor.desktop');
        button.connect('clicked', () => {
            this.menu.close(true);
            app.activate();
        });
        box.add_child(button);

        button = new St.Button({style_class: 'button'});
        button.child = new St.Icon({
            icon_name: 'preferences-system-symbolic',
            icon_size: 16,
        });
        button.connect('clicked', () => {
            this.menu.close(true);
            ExtensionUtils.openPrefs();
        });
        box.add_child(button);

        this.addMenuRow(box, 0, 2, 1);
    }

    addMenuRow(widget, col, colSpan, rowSpan) {
        this.lm.attach(widget, col, this.menuRow, colSpan, rowSpan);
        this.menuCol += colSpan;
        if (this.menuCol >= MENU_COLUMNS) {
            this.menuRow++;
            this.menuCol = 0;
        }
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
    }
});

// Older versions of GNOME Shell used a different version of Clutter.
// The TopHatMonitorLegacy class is compatible with these older releases.

const ShellConfig = imports.misc.config;
const [shellMajor, shellMinor] = ShellConfig.PACKAGE_VERSION.split('.').map(s => Number(s));

if (shellMajor === 3 && shellMinor <= 36) {
    // log('TopHat: Using legacy base class');
    const MonitorLegacy = Me.imports.lib.monitor_legacy;
    TopHatMonitor = MonitorLegacy.TopHatMonitorLegacy;
}

var Meter = GObject.registerClass({
}, class TopHatMeter extends St.BoxLayout {
    _init(numBars = 1) {
        super._init({style_class: 'tophat-meter', y_align: Clutter.ActorAlign.CENTER, y_expand: true});

        let width = this.computeBarWidth(numBars);
        let bars = new Array(numBars);
        for (let i = 0; i < numBars; i++) {
            let bar = new St.Widget(
                {
                    style_class: 'tophat-meter-bar',
                    y_align: Clutter.ActorAlign.END,
                    y_expand: false,
                    style: `width:${width}px;background-color:${Config.METER_FG_COLOR};`,
                });
            bars[i] = bar;
            this.add_child(bars[i]);
        }
        this.bars = bars;
        this.barWidth = width;
        let themeContext = St.ThemeContext.get_for_stage(global.get_stage());
        this.scaleFactor = themeContext.get_scale_factor();
        themeContext.connect('notify::scale-factor', obj => {
            this.scaleFactor = obj.get_scale_factor();
        });
    }

    setUsage(usage) {
        // FIXME: Cache the meter's height (and listen for changes)
        let [, height] = this.get_size();
        for (let i = 0; i < usage.length; i++) {
            let fillHeight = Math.ceil(usage[i] / 100.0 * height) / this.scaleFactor;
            let style = `height:${fillHeight}px;width:${this.barWidth}px;background-color:${Config.METER_FG_COLOR};`;
            this.bars[i].set_style(style);
        }
    }

    computeBarWidth(numBars) {
        let width = Config.METER_BAR_WIDTH;
        if (numBars > 8) {
            width *= .5; // Reduce bar width by half when there are many bars
        } else if (numBars > 2) {
            width *= .75; // Reduce bar width by 3/4 when there are a few bars
        }
        return width;
    }

    enable_animation() {
        this.bars.forEach(bar => {
            bar.save_easing_state();
            bar.set_easing_duration(400);
        });
    }

    disable_animation() {
        this.bars.forEach(bar => {
            bar.restore_easing_state();
        });
    }
});
