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
        this._udevClient = new GUdev.Client({subsystems: ['usb']});
        this._udevHandler = this._udevClient.connect(
            'uevent', this._onUevent.bind(this)
        );
        this._notifySource = new MessageTray.Source({
            title: 'USB Notify',
        });
        Main.messageTray.add(this._notifySource);
        this._deviceDescriptionCache = new Map();
        // Pre-fill cache
        // if something have been plugged in before logging in, we won't receive add events for those devices
        for (const device of this._udevClient.query_by_subsystem('usb')) {
            if (device.get_property('DEVTYPE') === 'usb_device') {
                this._deviceDescriptionCache.set(
                    device.get_sysfs_path(),
                    this._getDeviceDescription(device)
                );
            }
        }
        this._surgeNotification = null;
        this._surgeNotificationTime = 0;
        this._surgeCount = 0;
    }

    disable() {
        if (this._udevClient) {
            this._udevClient.disconnect(this._udevHandler);
            this._udevClient = null;
            this._udevHandler = null;
        }
        if (this._notifySource) {
            this._notifySource.destroy();
            this._notifySource = null;
        }
        this._deviceDescriptionCache = null;
        this._surgeNotification = null;
        this._surgeNotificationTime = 0;
        this._surgeCount = 0;
    }

    _getDeviceDescription(device) {
        const vendor = (
            device.get_property('ID_VENDOR_FROM_DATABASE') ||
            device.get_property('ID_VENDOR') ||
            ''
        ).replaceAll('_', ' ');

        const model = (
            device.get_property('ID_MODEL_FROM_DATABASE') ||
            device.get_property('ID_MODEL') ||
            ''
        ).replaceAll('_', ' ');

        const major = device.get_property('MAJOR');
        const minor = device.get_property('MINOR');
        const deviceCode = (major && minor) ? `${major}:${minor}` : '';

        return [vendor, model, deviceCode].filter(Boolean).join(' ') || _('Unknown device');
    }

    _onUevent(_client, action, device) {
        // over-current event is as a change action to the hub device
        if (action === 'change') {
            const overCurrentPort = device.get_property('OVER_CURRENT_PORT');
            if (overCurrentPort) {
                const portName = overCurrentPort.split('/').pop();
                this._sendSurgeNotification(portName);
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
            const description = this._getDeviceDescription(device);
            this._deviceDescriptionCache.set(syspath, description);
            // limit to 10, delete the oldest entry
            if (this._deviceDescriptionCache.size > 10) {
                this._deviceDescriptionCache.delete(this._deviceDescriptionCache.keys().next().value);
            }
            this._sendNotification(
                _('USB device connected'),
                description,
                'drive-removable-media-symbolic',
                false
            );
        } else if (action === 'remove') {
            const description = this._deviceDescriptionCache.get(syspath) || this._getDeviceDescription(device);
            this._deviceDescriptionCache.delete(syspath);
            this._sendNotification(
                _('USB device disconnected'),
                description,
                'drive-removable-media-symbolic',
                false
            );
        }
    }

    // USB surge triggering always triggers many times in a row, do some debouncing
    _sendSurgeNotification(portName) {
        const SURGE_WINDOW_MS = 5000;
        const now = Date.now();
        const body = _('USB Device on [%s] needs more power than the port can supply.').format(portName);

        if (this._surgeNotification && (now - this._surgeNotificationTime) < SURGE_WINDOW_MS) {
            this._surgeCount++;
            this._surgeNotification.title = _('Power surge on the USB port (x%d)').format(this._surgeCount);
            this._surgeNotificationTime = now;
            return;
        }

        this._surgeCount = 1;
        this._surgeNotificationTime = now;
        const notification = new MessageTray.Notification({
            source: this._notifySource,
            title: _('Power surge on the USB port'),
            body,
            iconName: 'dialog-error-symbolic',
            urgency: MessageTray.Urgency.CRITICAL,
        });
        notification.connect('destroy', () => {
            if (this._surgeNotification === notification)
                this._surgeNotification = null;
        });
        this._notifySource.addNotification(notification);
        this._surgeNotification = notification;
    }

    _sendNotification(title, body, iconName, isCritical) {
        const notification = new MessageTray.Notification({
            source: this._notifySource,
            title,
            body,
            iconName,
            urgency: isCritical
                ? MessageTray.Urgency.CRITICAL
                : MessageTray.Urgency.NORMAL,
        });
        this._notifySource.addNotification(notification);
    }
}
