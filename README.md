# USB Notify

A GNOME Shell extension that shows desktop notifications when USB devices are connected, disconnected, or trigger overcurrent protection.

## Translation

Translation source files live in the `po/` directory.

### Adding a New Translation

Below, `zh_CN` is used as an example.

1. Generate a PO file for your language from the template:

```bash
msginit --input=po/messages.pot --locale=zh_CN.UTF-8 --output=po/zh_CN.po
```

2. Edit `po/zh_CN.po` with a text editor or a tool like [Gtranslator](https://flathub.org/apps/org.gnome.Gtranslator) / [POEdit](https://flathub.org/apps/net.poedit.Poedit).

3. Compile and install:

```bash
bash ./scripts/install-develop.sh
```

### Updating the Template

After adding or changing translatable strings in the source code, regenerate the POT file:

```bash
xgettext --from-code=UTF-8 --output=po/messages.pot *.js
```

Then update existing PO files:

```bash
msgmerge --update po/zh_CN.po po/messages.pot
```

## License

GPL-2.0-or-later
