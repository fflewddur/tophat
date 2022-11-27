# TopHat

TopHat is an elegant system resource monitor for the GNOME shell. It displays
CPU, memory, and network activity in the GNOME top bar.

<img src="./screenshots/tophat.png?raw=true" width="1084px" alt="Screenshot of
TopHat">

## Installation

1. Install TopHat from the [GNOME Shell extensions
page](https://extensions.gnome.org/extension/5219/tophat/).

2. Manually install TopHat.
- Install `gnome-tweak-tool` and `unzip`.
- Download a TopHat release for your GNOME version on GNOME's extensions page.
- Extract downloaded zip to `~/.local/share/gnome-shell/extensions/`. If you don't have `~/.local/share/gnome-shell/extensions/`, create it by running `mkdir -p ~/.local/share/gnome-shell/extensions/`.
```
unzip tophatfflewddur.github.io.vX.shell-extension.zip \
-d ~/.local/share/gnome-shell/extensions/tophat@fflewddur.github.io/
```
- Shell reload is required `Alt+F2 r Enter`. The extension can be enabled with gnome-tweak-tool. 

Most Debian-based systems (including Ubuntu and Pop!_OS) will also need
'gir1.2-gtop-2.0' to be installed. Usually this means running the command
`sudo apt install gir1.2-gtop-2.0` followed by a system restart.

### Requirements

- GNOME 3.32 or newer
- The gtop system monitoring library (e.g., 'libgtop' on Debian-based systems,
  likely already installed as part of GNOME)
- GIRepository (gir) bindings for the gtop system monitoring library (e.g.,
  'gir1.2-gtop-2.0' on Debian-based systems)

### Compatibility

The latest release of TopHat has been tested on the following systems:

- Arch Linux
- CentOS Stream 8
- CentOS Stream 9
- Debian 11.4 (first install gir1.2-gtop-2.0 package)
- Fedora 36
- Fedora 37
- openSUSE Leap 15.4 (first install typelib-1_0-GTop-2_0 package)
- Pop!_OS 22.04 LTS (first install gir1.2-gtop-2.0 package)
- Ubuntu 22.04 LTS (first install gir1.2-gtop-2.0 package)
- Ubuntu 22.10 (first install gir1.2-gtop-2.0 package)

## Release notes

See [RELEASES.md](RELEASES.md) for the list of fixes and new functionality
included in each release.

## Contributing

Contributions to improve TopHat are welcome! To avoid duplicate work, check
[the issue tracker](https://github.com/fflewddur/tophat/issues) first. If an
issue doesn't already exist for your idea, please create one.

### Useful development commands

To view GNOME Shell logs output:
`journalctl -f -o cat /usr/bin/gnome-shell`.

To simulate heavy system load, use the `stress-ng` tool, e.g. `stress-ng
--timeout 10s --cpu 8`.

To test the development version:

    mkdir -p ~/.local/share/gnome-shell/extensions/
    ln -s [path to tophat repository] ~/.local/share/gnome-shell/extensions/tophat@fflewddur.github.io

## License

TopHat is distributed under the terms of the GNU General Public License,
version 3 or later. See the [license] file for details.

### Credits

TopHat was designed and written by [Todd
Kulesza](https://github.com/fflewddur), with much inspiration from the GNOME
[system-monitor
extension](https://extensions.gnome.org/extension/120/system-monitor/) and
[iStat Menus](https://bjango.com/mac/istatmenus/).

### Icons

The images in the 'icons' directory are derived works from
[thenounproject.com](https://thenounproject.com) and used under the [Creative
Commons Attribution license](https://creativecommons.org/licenses/by/3.0/).
The authors of each original work are:

icons/cpu.svg: [jai](https://thenounproject.com/jairam.182/)  
icons/mem.svg: [Loudoun Design
Co.](https://thenonproject.com/LoudounDesignCo/)  
icons/net.svg: [Pixel Bazaar](https://thenounproject.com/pixelbazaar/)  

All icons were edited to make them more legible at small sizes.

[license]: LICENSE
