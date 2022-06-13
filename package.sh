#! /bin/sh

gnome-extensions pack --force --extra-source lib --extra-source icons --extra-source README.md ./ && echo "Extension successfully packaged"
