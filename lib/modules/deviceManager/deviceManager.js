'use strict';
const lodash = require('lodash');

const { DeviceManagement } = require('@iobroker/dm-utils');

/**
 * DeviceManager Class
 */
class GridVisDeviceManagement extends DeviceManagement {
    /**
     * Initialize Class with Adapter
     *
     * @param adapter Adapter Reference
     */
    constructor(adapter) {
        super(adapter);
        this.adapter = adapter;
    }

    /**
     * List all devices
     *
     * @param context Context of loadDevices
     */
    async loadDevices(context) {
        context.setTotalDevices(Object.keys(this.adapter.objectStore.devices).length);
        const sortedDevices = Object.fromEntries(
            Object.entries(this.adapter.objectStore.devices).sort(([, a], [, b]) => {
                const nameA = a.object?.common?.name?.toLowerCase() || '';
                const nameB = b.object?.common?.name?.toLowerCase() || '';
                return nameA.localeCompare(nameB);
            }),
        );
        for (const [deviceId, deviceValue] of Object.entries(sortedDevices)) {
            const identifier = deviceValue.object.common.desc ?? deviceId;
            const res = {
                id: deviceId,
                identifier:
                    identifier < 27
                        ? identifier
                        : `${identifier.substring(0, 13)} ... ${identifier.substring(identifier.length - 13)}`,
                name:
                    deviceValue.object.common.name !== undefined && deviceValue.object.common.name !== ''
                        ? deviceValue.object.common.name
                        : deviceId,
                hasDetails: true,
                color: 'white',
                backgroundColor: 'primary',
                icon: `/adapter/${this.adapter.name}/operating-hours.png`,
            };
            res.customInfo = {
                id: deviceId,
                schema: {
                    type: 'panel',
                    items: {},
                },
            };
            // Assign adminitrative state
            // Enable
            let key = 'enableCounting';
            let value = deviceValue.administrative[key];
            let card = {
                name: ` ${this.replaceNameing(key)}`,
            };
            card = lodash.merge(card, value.object.native?.card);
            let preLabel = card.preLabel ?? '';
            let label = '';
            if (card.name) {
                label = card.name;
            } else if (card.label) {
                label = card.label;
            } else {
                label = value.object._id.substring(value.object._id.lastIndexOf('.') + 1);
            }
            res.customInfo.schema.items[`_${value.object._id}`] = {
                type: 'state',
                oid: value.object._id,
                foreign: true,
                control: 'switch',
                label: preLabel + label,
            };
            // Counter
            key = 'activationCounter';
            value = deviceValue.administrative[key];
            card = {
                name: ` ${this.replaceNameing(key)}`,
            };
            card = lodash.merge(card, value.object.native?.card);
            preLabel = card.preLabel ?? '';
            label = '';
            if (card.name) {
                label = card.name;
            } else if (card.label) {
                label = card.label;
            } else {
                label = value.object._id.substring(value.object._id.lastIndexOf('.') + 1);
            }
            res.customInfo.schema.items[`_${value.object._id}`] = {
                type: 'state',
                oid: value.object._id,
                foreign: true,
                control: 'number',
                label: preLabel + label,
            };

            // Assign opatiing hours
            // timestring
            key = 'timestring_d_h_m_s';
            value = deviceValue.operatingHours[key];
            card = {
                name: ` ${this.replaceNameing(key)}`,
            };
            card = lodash.merge(card, value.object.native?.card);
            preLabel = card.preLabel ?? '';
            label = '';
            if (card.name) {
                label = card.name;
            } else if (card.label) {
                label = card.label;
            } else {
                label = value.object._id.substring(value.object._id.lastIndexOf('.') + 1);
            }
            res.customInfo.schema.items[`_${value.object._id}`] = {
                type: 'state',
                oid: value.object._id,
                foreign: true,
                control: 'text',
                label: preLabel + label,
            };

            // AVG On Time
            key = 'averageOnTime_h_m_s';
            value = deviceValue.operatingHours[key];
            card = {
                name: ` ${this.replaceNameing(key)}`,
            };
            card = lodash.merge(card, value.object.native?.card);
            preLabel = card.preLabel ?? '';
            label = '';
            if (card.name) {
                label = card.name;
            } else if (card.label) {
                label = card.label;
            } else {
                label = value.object._id.substring(value.object._id.lastIndexOf('.') + 1);
            }
            res.customInfo.schema.items[`_${value.object._id}`] = {
                type: 'state',
                oid: value.object._id,
                foreign: true,
                control: 'text',
                label: preLabel + label,
            };

            // Add device
            context.addDevice(res);
        }
    }

    /**
     * @param {string} id ID from device
     * @returns {Promise<import('@iobroker/dm-utils').DeviceDetails>} return the right value
     */
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    async getDeviceDetails(id) {
        /** @type {Record<string, import('@iobroker/dm-utils').ConfigItemAny & {digits?: number}>} */
        const valueItems = {};
        // eslint-disable-next-line jsdoc/check-tag-names
        // eslint-disable-next-line jsdoc/check-tag-names
        /** @type {Record<string, import('@iobroker/dm-utils').ConfigItemAny>} */
        const deviceObjectItems = {};
        const data = {};

        // Show 2 Administrative values
        valueItems['AdministrativeHeader'] = {
            newLine: true,
            type: 'header',
            text: 'administrative',
            size: 3,
        };
        let value = this.adapter.objectStore.devices[id].administrative.enableCounting;
        valueItems[`Value_${value.object._id}`] = {
            type: 'state',
            label: value.object._id,
            oid: value.object._id,
            foreign: true,
        };
        value = this.adapter.objectStore.devices[id].administrative.activationCounter;
        valueItems[`Value_${value.object._id}`] = {
            type: 'state',
            label: value.object._id,
            oid: value.object._id,
            foreign: true,
        };

        // Schow operation Hours states
        valueItems['OperatingHoursHeader'] = {
            newLine: true,
            type: 'header',
            text: 'operatingHours',
            size: 3,
        };

        value = this.adapter.objectStore.devices[id].operatingHours;
        delete value.object;
        this.adapter.log.warn(JSON.stringify(value));
        const sorted = Object.fromEntries(
            Object.entries(value).sort(([, a], [, b]) => a.object.common.name.localeCompare(b.object.common.name)),
        );
        this.adapter.log.warn(JSON.stringify(sorted));
        for (const value of Object.values(sorted)) {
            valueItems[`Value_${value.object.common.name}`] = {
                type: 'state',
                label: value.object._id,
                oid: value.object._id,
                foreign: true,
            };
        }

        // Devices Object
        deviceObjectItems['DeviceObjectHeader'] = {
            newLine: true,
            type: 'header',
            text: 'DeviceObject',
            size: 3,
        };
        deviceObjectItems['DeviceObject'] = {
            type: 'text',
            readOnly: true,
            minRows: 30,
            maxRows: 30,
        };
        data.DeviceObject = JSON.stringify(this.adapter.objectStore.devices[id], null, 2);

        // eslint-disable-next-line jsdoc/check-tag-names
        /** @type {import('@iobroker/dm-utils').JsonFormSchema} */
        const schema = {
            type: 'tabs',
            tabsStyle: {
                minWidth: 850,
            },
            items: {},
        };
        schema.items.sourceItems = {
            type: 'panel',
            label: 'valueStates',
            items: valueItems,
        };
        schema.items.deviceObtectItems = {
            type: 'panel',
            label: 'deviceObject',
            items: deviceObjectItems,
        };
        // return the schema
        return { id, schema, data };
    }

    /**
     *
     * @param name Name to replace
     */
    replaceNameing(name) {
        switch (name) {
            case 'enableCounting':
                return 'Zählen';

            case 'activationCounter':
                return 'Anzahl Aktivierungen';

            case 'averageOnTime_h_m_s':
                return 'Durchschnitt';

            case 'timestring_d_h_m_s':
                return 'Einschaltdauer';
            default:
                return name;
        }
    }
}
module.exports = GridVisDeviceManagement;
