'use strict';

/**
 * Objectstore Class
 */
class objectStoreClass {
    /**
     * Initalize Class with Adapter
     *
     * @param adapter Adapter Reference
     */
    constructor(adapter) {
        this.adapter = adapter;

        // Objects
        this.devices = {};
        this.currentIds = {};
        this.startCondition = `${this.adapter.namespace}.`;
    }

    /**
     *  Funktion to get Devicestructure
     *
     */
    async generateStoreObjects() {
        const activeFunction = 'objectStore.js - generateDeviceObjects';
        this.adapter.log.silly(`Function ${activeFunction} started.`);
        try {
            // Get the States
            const adapterObjects = await this.adapter.getAdapterObjectsAsync();
            for (const adapterObject of Object.values(adapterObjects)) {
                if (adapterObject._id.startsWith(this.startCondition)) {
                    await this.initDeviceObject(adapterObject._id, { payload: { object: adapterObject } });
                }
            }
        } catch (error) {
            this.adapter.log.error(`error at ${activeFunction}:  ${error}`);
        }
    }

    /********************************************************************************************************************************
     * ******************************************************************************************************************************
     * *************************************************************************************************************************** */

    /**
     * @param id id, for wich the structure is to build
     * @param options eg. payload wich is set to last element in id
     */
    async initDeviceObject(id, options = {}) {
        const activeFunction = 'objectStore.js - initLoraWanObject';
        this.adapter.log.silly(`Function ${activeFunction} started.`);
        try {
            let { strip = 2, payload } = options;
            // Get global values
            const deviceObject = this.devices;
            const idObject = this.currentIds;

            const parts = id.split('.').slice(strip);
            let node = deviceObject;
            for (let i = 0; i < parts.length; i++) {
                const key = parts[i];
                const isLast = i === parts.length - 1;

                if (isLast) {
                    if (payload !== undefined) {
                        // Assign object, if not present
                        node[key] ??= {};
                        idObject[id] ??= node[key];
                        // Assign payload entries
                        for (const [name, value] of Object.entries(payload)) {
                            node[key][name] = value;
                        }

                        // Following only type state
                        if (node[key].object?.type === 'state') {
                            // Get state, if not present
                            if (!node[key].state) {
                                if (node[key].object._id) {
                                    const state = await this.adapter.getStateAsync(node[key].object._id);
                                    node[key].state = state;
                                }
                            }
                        }
                    } else {
                        node[key] ??= {};
                        idObject[id] ??= node[key];
                    }
                } else {
                    node[key] ??= {};
                    node = node[key];
                }
            }
        } catch (error) {
            this.adapter.log.error(`error at ${activeFunction}:  ${error} - id: ${id}`);
        }
    }

    /**
     * @param id id, for wich the structure is to build
     * @param options eg. payload wich is set to last element in id
     */
    async updateDeviceObject(id, options = {}) {
        const activeFunction = 'objectStore.js - initLoraWanObject';
        this.adapter.log.silly(`Function ${activeFunction} started.`);
        try {
            let { strip = 3, payload } = options;
            // Get global values
            const deviceObject = this.devices;
            const idObject = this.currentIds;

            const parts = id.split('.').slice(strip);
            let node = deviceObject;
            const deviceId = parts[0];
            if (!deviceObject[deviceId]) {
                await this.initDeviceObject(id, options);
                return;
            }
            for (let i = 0; i < parts.length; i++) {
                const key = parts[i];
                const isLast = i === parts.length - 1;

                if (isLast) {
                    if (payload !== undefined) {
                        // Assign object, if not present
                        node[key] ??= {};
                        idObject[id] ??= node[key];
                        // Assign payload entries
                        for (const [name, value] of Object.entries(payload)) {
                            node[key][name] = value;
                        }
                    } else {
                        node[key] ??= {};
                        idObject[id] ??= node[key];
                    }
                } else {
                    node[key] ??= {};
                    node = node[key];
                }
            }
        } catch (error) {
            this.adapter.log.error(`error at ${activeFunction}:  ${error} - id: ${id}`);
        }
    }
    /********************************************************************************************************************************
     * ******************************************************************************************************************************
     * *************************************************************************************************************************** */
}

module.exports = objectStoreClass;
