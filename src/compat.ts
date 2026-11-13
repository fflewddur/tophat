import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';

// St.BoxLayout gained orientation in GNOME 48; vertical was removed in 51.
export const orientationProperty =
  'orientation' in St.BoxLayout.prototype ? 'orientation' : 'vertical';

export function boxOrientation(vertical: boolean) {
  return orientationProperty === 'orientation'
    ? {
        orientation: vertical
          ? Clutter.Orientation.VERTICAL
          : Clutter.Orientation.HORIZONTAL,
      }
    : { vertical };
}

export function isVertical(box: St.BoxLayout) {
  return orientationProperty === 'orientation'
    ? box.orientation === Clutter.Orientation.VERTICAL
    : box.vertical;
}

export function setVertical(box: St.BoxLayout, vertical: boolean) {
  box.set(boxOrientation(vertical));
}

// Popup menus switched from an animation argument to an options object in 51.
export const menuAnimation = (Number(Config.PACKAGE_VERSION.split('.')[0]) >= 51
  ? { animate: true }
  : true) as unknown as boolean;
