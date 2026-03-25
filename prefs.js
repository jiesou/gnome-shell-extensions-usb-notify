/* prefs.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import GUdev from 'gi://GUdev';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UsbNotifyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // ── Page ────────────────────────────────────────────────────────────
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // ── Ignore List Group ────────────────────────────────────────────────
        const ignoreListGroup = new Adw.PreferencesGroup({
            title: _('Ignore List'),
            description: _('These USB devices will not trigger notifications'),
        });
        page.add(ignoreListGroup);

        // ExpanderRow: contains confirmed device rows as sub-rows
        const expanderRow = new Adw.ExpanderRow({
            title: _('Ignored Devices'),
        });
        ignoreListGroup.add(expanderRow);

        // "+" suffix button on the expander
        const addIgnoreBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Add device to ignore list'),
        });
        expanderRow.add_suffix(addIgnoreBtn);

        // Build id → description map to show descriptions in the ignore list
        const connectedDevices = this._getConnectedDevices();
        const descriptionMap = new Map(connectedDevices.map(d => [d.id, d.description]));

        let rows = [];
        let inputRow = null;

        const updateExpanderState = () => {
            const hasItems = rows.length > 0 || inputRow !== null;
            expanderRow.enable_expansion = hasItems;
            expanderRow.expanded = hasItems;
        };

        const createDeviceRow = id => {
            const description = descriptionMap.get(id);
            const row = new Adw.ActionRow({
                title: id,
                ...(description ? {subtitle: description} : {}),
            });
            const removeBtn = new Gtk.Button({
                icon_name: 'list-remove-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action', 'flat'],
                tooltip_text: _('Remove'),
            });
            removeBtn.connect('clicked', () => {
                const current = settings.get_strv('ignore-list');
                settings.set_strv('ignore-list', current.filter(i => i !== id));
            });
            row.add_suffix(removeBtn);
            return row;
        };

        const refreshIgnoreRows = () => {
            for (const row of rows)
                expanderRow.remove(row);
            rows = [];

            for (const id of settings.get_strv('ignore-list')) {
                const row = createDeviceRow(id);
                expanderRow.add_row(row);
                rows.push(row);
            }
            updateExpanderState();
        };

        const openInputRow = () => {
            if (inputRow)
                return;

            addIgnoreBtn.sensitive = false;
            expanderRow.enable_expansion = true;
            expanderRow.expanded = true;

            const row = new Adw.ActionRow();
            inputRow = row;

            const entry = new Gtk.Entry({
                placeholder_text: _('Device ID (VID:PID)'),
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.CENTER,
                hexpand: true,
            });

            // ── Device picker popover ────────────────────────────────────────
            const deviceMenuButton = new Gtk.MenuButton({
                icon_name: 'view-list-symbolic',
                css_classes: ['flat'],
                valign: Gtk.Align.CENTER,
                tooltip_text: _('Choose from connected devices'),
            });

            const popover = new Gtk.Popover();
            const popoverBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 6,
                margin_end: 6,
            });

            const searchEntry = new Gtk.SearchEntry({
                placeholder_text: _('Search devices…'),
                margin_bottom: 6,
            });

            const scrolledWindow = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                height_request: 200,
                width_request: 320,
            });

            const listBox = new Gtk.ListBox({css_classes: ['boxed-list']});

            const listRows = connectedDevices.map(device => {
                const listRow = new Gtk.ListBoxRow();
                listRow.set_child(new Gtk.Label({
                    label: `${device.id}  (${device.description})`,
                    halign: Gtk.Align.START,
                    hexpand: true,
                    margin_top: 6,
                    margin_bottom: 6,
                    margin_start: 8,
                    margin_end: 8,
                }));
                listRow._device = device;
                listBox.append(listRow);
                return listRow;
            });

            searchEntry.connect('search-changed', () => {
                const text = searchEntry.get_text().toLowerCase();
                for (const row of listRows) {
                    const {id, description} = row._device;
                    row.set_visible(id.includes(text) || description.toLowerCase().includes(text));
                }
            });

            searchEntry.connect('activate', () => {
                const first = listRows.find(r => r.visible);
                if (first)
                    listBox.emit('row-activated', first);
                entry.grab_focus();
            });

            listBox.connect('row-activated', (_list, listRow) => {
                if (listRow?._device) {
                    entry.set_text(listRow._device.id);
                    popover.popdown();
                }
            });

            popoverBox.append(searchEntry);
            popoverBox.append(scrolledWindow);
            scrolledWindow.set_child(listBox);
            popover.set_child(popoverBox);
            deviceMenuButton.set_popover(popover);
            // ────────────────────────────────────────────────────────────────

            const okBtn = new Gtk.Button({
                icon_name: 'object-select-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                tooltip_text: _('Confirm'),
            });
            const cancelBtn = new Gtk.Button({
                icon_name: 'window-close-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                tooltip_text: _('Cancel'),
            });

            const commit = () => {
                const id = entry.get_text().trim().toLowerCase();
                if (id) {
                    const current = settings.get_strv('ignore-list');
                    if (!current.includes(id))
                        settings.set_strv('ignore-list', [...current, id]);
                }
                expanderRow.remove(inputRow);
                inputRow = null;
                addIgnoreBtn.sensitive = true;
            };

            const discard = () => {
                expanderRow.remove(inputRow);
                inputRow = null;
                addIgnoreBtn.sensitive = true;
                updateExpanderState();
            };

            entry.connect('activate', commit);
            okBtn.connect('clicked', commit);
            cancelBtn.connect('clicked', discard);

            row.add_prefix(entry);
            row.add_suffix(deviceMenuButton);
            row.add_suffix(okBtn);
            row.add_suffix(cancelBtn);

            expanderRow.add_row(row);
            entry.grab_focus();
        };

        addIgnoreBtn.connect('clicked', openInputRow);

        refreshIgnoreRows();
        settings.connect('changed::ignore-list', refreshIgnoreRows);
    }

    // Enumerate connected USB devices and return deduplicated array of { id, description }
    _getConnectedDevices() {
        const udevClient = new GUdev.Client({subsystems: ['usb']});
        const seen = new Set();
        const result = [];

        for (const device of udevClient.query_by_subsystem('usb')) {
            if (device.get_property('DEVTYPE') !== 'usb_device')
                continue;

            const vid = device.get_property('ID_VENDOR_ID');
            const pid = device.get_property('ID_MODEL_ID');
            if (!vid || !pid)
                continue;

            const id = `${vid}:${pid}`.toLowerCase();
            if (seen.has(id))
                continue;
            seen.add(id);

            const prop = (k1, k2) => (device.get_property(k1) || device.get_property(k2) || '').replaceAll('_', ' ');
            const vendor = prop('ID_VENDOR', 'ID_VENDOR_FROM_DATABASE');
            const model  = prop('ID_MODEL',  'ID_MODEL_FROM_DATABASE');
            const description = [vendor, model].filter(Boolean).join(' ') || _('Unknown device');
            result.push({id, description});
        }

        return result;
    }
}
