#! /bin/sh

cp ./resources/metadata.json ./dist/ && touch ./dist/schemas && rm -rf ./dist/schemas && mkdir ./dist/schemas/ && glib-compile-schemas ./resources/schemas && mv ./resources/schemas/gschemas.compiled ./dist/schemas/ && cp ./resources/*.css ./dist/ && touch ./dist/icons && rm -rf ./dist/icons && mkdir -p ./dist/icons/hicolor/scalable/actions && cp ./resources/icons/*.svg ./dist/icons/hicolor/scalable/actions/ && rm ./dist/icons/hicolor/scalable/actions/logo.svg 

#&& gtk-update-icon-cache -t -q -f ./dist/icons