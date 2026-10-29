// Copyright (C) 2025 Todd Kulesza <todd@dropline.net>
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
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import * as BarLevel from 'resource:///org/gnome/shell/ui/barLevel.js';
import { AnimationDuration, AnimationEasing } from './meter.js';
import { adjustAnimationTime } from 'resource:///org/gnome/shell/misc/animationUtils.js';
export const CapacityBar = GObject.registerClass(class CapacityBar extends BarLevel.BarLevel {
    color;
    constructor() {
        super({
            style_class: 'tophat-cap-bar slider',
            can_focus: false,
            reactive: false,
            track_hover: true,
            hover: false,
            accessible_role: Atk.Role.SLIDER,
            x_expand: true,
        });
        this.value = 0;
        this.color = new Cogl.Color();
    }
    setUsage(usage) {
        if (Number.isNaN(usage)) {
            console.warn('setUsage(): usage is NaN');
            usage = 0;
        }
        else if (usage < 0) {
            console.warn('setUsage(): usage < 0: ' + usage);
            usage = 0;
        }
        else if (usage > 1) {
            console.warn('setUsage: usage > 1: ' + usage);
            usage = 1;
        }
        this.remove_transition('usage');
        const duration = adjustAnimationTime(AnimationDuration);
        if (duration > 0) {
            const t = Clutter.PropertyTransition.new_for_actor(this, 'value');
            t.set_progress_mode(AnimationEasing);
            t.set_duration(duration);
            t.set_to(usage);
            t.set_remove_on_complete(true);
            this.add_transition('usage', t);
            t.start();
        }
        else {
            this.value = usage;
        }
    }
    setColor(c) {
        let ok;
        let color;
        if (Cogl.color_from_string) {
            [ok, color] = Cogl.color_from_string(c);
        }
        else {
            // GNOME 46 and earlier
            // @ts-expect-error property does not exist
            [ok, color] = Clutter.color_from_string(c);
        }
        if (!ok) {
            console.warn(`Error parsing ${c} to Cogl.Color`);
            return;
        }
        this.color = color;
    }
    vfunc_style_changed() {
        const themeNode = this.get_theme_node();
        // @ts-expect-error does not exist
        this._barLevelHeight = themeNode.get_height();
        // @ts-expect-error does not exist
        this._barLevelColor = themeNode.get_background_color();
        if (!this.color) {
            this.color = themeNode.get_color('-barlevel-active-background-color');
        }
        // @ts-expect-error does not exist
        this._barLevelActiveColor = this.color;
        // The next two properties are for GNOME 46 and earlier
        // @ts-expect-error does not exist
        this._barLevelBorderColor = this.color;
        // @ts-expect-error does not exist
        this._barLevelActiveBorderColor = this.color;
    }
    _getPreferredHeight() {
        // @ts-expect-error does not exist
        const barHeight = super._getPreferredHeight();
        return barHeight;
    }
    _getPreferredWidth() {
        // @ts-expect-error does not exist
        const barWidth = super._getPreferredWidth();
        return barWidth;
    }
});
