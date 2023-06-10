#! /bin/sh

gnome-extensions pack --force --extra-source=lib --extra-source=icons --extra-source=../LICENSE --extra-source=../README.md --extra-source=../RELEASES.md --extra-source=classic.css --podir=../po ./tophat@fflewddur.github.io && echo "Extension successfully packaged"
