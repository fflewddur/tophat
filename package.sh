#! /bin/sh

gnome-extensions pack --force --extra-source=lib --extra-source=icons --extra-source=LICENSE --extra-source=README.md --extra-source=RELEASES.md ./ && echo "Extension successfully packaged"
