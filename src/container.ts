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

import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { registerGObjectClass } from './helpers.js';
import { TopHatMeter } from './meter.js';

@registerGObjectClass
export class TopHatContainer extends PanelMenu.Button {
  private box;
  private meters;

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

    const label = new St.Label({
      text: 'Hello, world!',
    });
    this.box.add_child(label);
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
