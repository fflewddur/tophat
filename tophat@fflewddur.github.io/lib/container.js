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

import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export var TopHatContainer = GObject.registerClass(
class TopHatContainer extends PanelMenu.Button {
    _init(menuAlignment, nameText, dontCreateMenu) {
        super._init({
            menuAlignment,
            nameText,
            dontCreateMenu,
        });
        this.monitors = [];
        this.box = new St.BoxLayout();
        this.add_child(this.box);
        this.remove_style_class_name('panel-button');
    }

    addMonitor(monitor) {
        // log(`TopHat addMonitor(${monitor.name})`);
        this.monitors.push(monitor);
        this.box.add_child(monitor);
    }

    _onDestroy() {
        this.monitors.forEach(monitor => {
            monitor.destroy();
        });
        super._onDestroy();
    }
});
