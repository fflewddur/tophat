#! /bin/sh

gnome-extensions pack --force --extra-source lib --extra-source icons --extra-source README.md RELEASES.md ./ && echo "Extension successfully packaged"
