# Release notes

All notable changes to [TopHat] are listed in this file. The format is loosely
based on [Keep a Changelog].

## Not yet released

- Added option to show disk activity instead of (or in addition to) available storage
- Added y-axis scales to the activity over time charts
- Added system uptime to the CPU monitor menu

## TopHat 10 - May 29, 2023

- Added option to adjust refresh speed
- Added option to display numeric values instead of (or in addition to) usage meters
- Fixed panel icons to follow system theme (from [@hrqmonteiro](https://github.com/hrqmonteiro))
- Added Czech translation (from [@Amereyeu](https://github.com/Amereyeu))
- Updated Turkish translation (from [@nxjosephofficial](https://github.com/nxjosephofficial))

## TopHat 9 - March 19, 2023

- Fixed a GNOME Shell crash that could occur when a virtual network is removed
- Fixed double-counting of network traffic to virtual machines
- Fixed detection of mounted/unmounted drives in the disk activity monitor
- Verified compatibility with GNOME 44

## TopHat 8 - February 13, 2023

- Fixed problems that caused excessive error messages in log files

## TopHat 7 - January 27, 2023

- Added a disk activity and file system usage monitor
- Fixed compatibility with GNOME 3.32 - 3.36
- Fixed problem reading temperatures from AMD CPUs (from
  [@theizzer](https://github.com/theizzer))
- Fixed non-existent swap partitions showing as 'NaN%' in the memory menu
  (from [@flozz](https://github.com/flozz))
- Improved efficiency by fully disabling monitors when they are hidden
- Updated translations: Dutch (from [@Vistaus](https://github.com/Vistaus))

## TopHat 6 - December 27, 2022

- Added CPU model, clock speed, and temperature to processor menu
- Added memory size, swap size, and current usage to memory menu
- Fixed problems with high-resolution displays
- Fixed miscalculation of per-process memory usage

## TopHat 5 - November 28, 2022

- Added option to animate the meters
- Added option to change meter color
- Added option to condense CPU cores into one meter
- Added option to show network activity in bits instead of bytes (from
  [@esalvati](https://github.com/esalvati))
- Added preferences launcher to dropdown menu
- Added French translation from [@noirbizarre](https://github.com/noirbizarre)
- Fixed icon appearance with transparent top bars
- Fixed weirdly tall monitors when using Dash to Panel extension
- Removed support for GNOME Shell 3.36 and earlier

## TopHat 4 - September 19, 2022

- Fixed compatibility with GNOME Shell 3.32 and newer
- Fixed issue where TopHat's resource monitors could become ungrouped
- Fixed excessive logging when network devices changed
- Added option to change TopHat's position in the panel
- Added translation infrastructure
- Added Dutch translation from [@Vistaus](https://github.com/Vistaus)
- Added Turkish translation from
  [@nxjosephofficial](https://github.com/nxjosephofficial)

## TopHat 3 - August 25, 2022

- Added options to show or hide each resource monitor
- Added option to show or hide icons in the top bar
- Fixed compatibility with light desktop themes
- Fixed compatibility with translucent desktop themes
- Fixed formatting with Dash to Panel extension

## TopHat 2 - July 24, 2022

The first public release. 🎉️

[TopHat]: https://extensions.gnome.org/extension/5219/tophat/
[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/
