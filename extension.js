/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import GUdev from 'gi://GUdev';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

export default class UsbNotifyExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._udevClient = new GUdev.Client({subsystems: ['usb']});
        this._udevHandler = this._udevClient.connect(
            'uevent', this._onUevent.bind(this)
        );
        Main.messageTray.add(MessageTray.getSystemSource());
        // Cache stores { id, description } per sysfs path
        // Pre-fill cache: devices plugged in before login have no 'add' event
        this._devicesCache = new Map();
        for (const device of this._udevClient.query_by_subsystem('usb')) {
            if (device.get_property('DEVTYPE') === 'usb_device') {
                this._devicesCache.set(
                    device.get_sysfs_path(),
                    this._getDevice(device)
                );
            }
        }
        this._surgeNotification = null;
        this._surgeNotificationTime = 0;
    }

    disable() {
        if (this._udevClient) {
            this._udevClient.disconnect(this._udevHandler);
            this._udevClient = null;
            this._udevHandler = null;
        }
        this._devicesCache = null;
        this._surgeNotification = null;
        this._surgeNotificationTime = 0;
        this._settings = null;
    }

    // Returns { id: 'vid:pid', description: 'Vendor Model' }
    _getDevice(device) {
        const prop = (k1, k2) => (device.get_property(k1) || device.get_property(k2) || '').replaceAll('_', ' ');
        const vendor = prop('ID_VENDOR', 'ID_VENDOR_FROM_DATABASE');
        const model  = prop('ID_MODEL',  'ID_MODEL_FROM_DATABASE');
        const vid = device.get_property('ID_VENDOR_ID');
        const pid = device.get_property('ID_MODEL_ID');
        return {
            id: (vid && pid) ? `${vid}:${pid}`.toLowerCase() : '',
            description: [vendor, model].filter(Boolean).join(' ') || _('Unknown device'),
        };
    }

    _isIgnored(id) {
        return !!id && this._settings.get_strv('ignore-list').includes(id);
    }

    _deviceLabel({id, description}) {
        return id ? `${description} ${id}` : description;
    }

    _onUevent(_client, action, device) {
        // over-current event is as a change action to the hub device
        if (action === 'change' && device.get_property('DEVTYPE') === 'usb_interface') {
            const overCurrentPort = device.get_property('OVER_CURRENT_PORT');
            const overCurrentCount = device.get_property('OVER_CURRENT_COUNT');
            if (overCurrentPort) {
                const portName = overCurrentPort.split('/').pop();
                this._sendSurgeNotification(portName, parseInt(overCurrentCount) || 1);
            }
            return;
        }

        // only handle usb_device, ignore usb_interface etc
        if (device.get_property('DEVTYPE') !== 'usb_device')
            return;

        // ignore root hub（bDeviceClass=09）
        // const devClass = device.get_sysfs_attr('bDeviceClass');
        // if (devClass === '09')
        //     return;

        const syspath = device.get_sysfs_path();

        if (action === 'add') {
            const info = this._getDevice(device);
            this._devicesCache.set(syspath, info);
            if (this._devicesCache.size > 10)
                this._devicesCache.delete(this._devicesCache.keys().next().value);
            if (this._isIgnored(info.id))
                return;
            this._sendNotification(_('USB device connected'), this._deviceLabel(info));
        } else if (action === 'remove') {
            const info = this._devicesCache.get(syspath) ?? this._getDevice(device);
            this._devicesCache.delete(syspath);
            if (this._isIgnored(info.id))
                return;
            this._sendNotification(_('USB device disconnected'), this._deviceLabel(info));
        }
    }

    // USB surge triggering always triggers many times in a row, do some debouncing
    _sendSurgeNotification(portName, overCurrentCount) {
        const SURGE_WINDOW_MS = 5000;
        const now = Date.now();
        const body = _('USB Device on [%s] needs more power than the port can supply.').format(portName);

        if (this._surgeNotification && (now - this._surgeNotificationTime) < SURGE_WINDOW_MS) {
            this._surgeNotification.title = _('Power surge on the USB port (x%d)').format(overCurrentCount);
            this._surgeNotificationTime = now;
            return;
        }

        this._surgeNotificationTime = now;
        const notification = new MessageTray.Notification({
            source: MessageTray.getSystemSource(),
            title: _('Power surge on the USB port (x%d)').format(overCurrentCount),
            body,
            iconName: 'dialog-error-symbolic',
            urgency: MessageTray.Urgency.CRITICAL,
        });
        notification.connect('destroy', () => {
            if (this._surgeNotification === notification)
                this._surgeNotification = null;
        });
        MessageTray.getSystemSource().addNotification(notification);
        this._surgeNotification = notification;
    }

    _sendNotification(title, body) {
        MessageTray.getSystemSource().addNotification(new MessageTray.Notification({
            source: MessageTray.getSystemSource(),
            title,
            body,
            iconName: 'drive-removable-media-symbolic',
            urgency: MessageTray.Urgency.NORMAL,
        }));
    }
}
