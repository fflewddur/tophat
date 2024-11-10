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

import { TopHatMeter } from './monitor.js';

export const TopHatContainer = GObject.registerClass(
  class TopHatContainer extends PanelMenu.Button {
    private box;
    public meters;

    constructor(
      menuAlignment: number,
      nameText: string,
      dontCreateMenu?: boolean
    ) {
      super(menuAlignment, nameText, dontCreateMenu);
      this.meters = new Array<TopHatMeter>();
      this.box = new St.BoxLayout();
      this.add_child(this.box);
      this.remove_style_class_name('panel-button');
    }

    public addMeter(meter: TopHatMeter): void {
      this.meters.push(meter);
      this.box.add_child(meter);
    }

    override destroy(): void {
      this.box.destroy();
      super.destroy();
    }
  }
);

export type TopHatContainer = InstanceType<typeof TopHatContainer>;
