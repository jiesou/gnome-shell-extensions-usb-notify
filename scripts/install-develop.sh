#!/bin/bash

gnome-extensions pack --podir=po --gettext-domain=usb-notify@jiesou.github.io -f
gnome-extensions install usb-notify@jiesou.github.io.shell-extension.zip -f
