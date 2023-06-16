"use strict";

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const schedule = require("node-schedule");

// Load your modules here, e.g.:
// const fs = require("fs");

class OperatingHours extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "operating-hours",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

		this.AdapterObjectsAtStart = {};

		this.configedChannels = {};
		this.internalIds = {
			state: "state",
			resetCronJob: "resetCronJob",
			timestamp : "timestamp"
		};
		this.channelFolders = {
			operatingHours : "operatingHours",
			administrative : "administrative"
		};
		this.operatingHours = {
			milliseconds : {name:"milliseconds",type:"number",write:true,unit:"ms",def:0},
			seconds : {name:"seconds",type:"number",write:true,unit:"s",def:0},
			minutes : {name:"minutes",type:"number",write:true,unit:"min",def:0},
			hours : {name:"hours",type:"number",write:true,unit:"h",def:0},
			days : {name:"days",type:"number",write:true,unit:"d",def:0},
			timestring_h_m :{name:"timestring_h_m",type:"string",write:false,unit:"h:m",def:""},
			timestring_h_m_s :{name:"timestring_h_m_s",type:"string",write:false,unit:"h:m:s",def:""},
			timestring_d_h_m_s :{name:"timestring_d_h_m_s",type:"string",write:false,unit:"d:h:m:s",def:""},
			json :{name:"json",type:"string",write:false,unit:"",def:""},
			averageOnTime_h_m_s :{name:"averageOnTime_h_m_s",type:"string",write:false,unit:"h:m:s",def:""},
		};
		this.administrative = {
			enableCounting : {name:"enableCounting", type:"boolean", write:true, def:false},
			activationCounter : {name:"activationCounter", type:"number", write:false, def:0}
		};

		this.timeouts = {};
		this.timeoutIds = {
			countingTimeout : "countingTimeout"
		};

		this.cronJobs ={};
		this.jobId = "jobId";
	}

	// Clear all Timeouts, if there are some
	clearAllTimeouts(){
		for(const myTimeout in this.timeouts)
		{
			this.clearTimeout(this.timeouts[myTimeout]);
			delete this.timeouts[myTimeout];
		}
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Generating the configed id internal (cleared)
		for(const element of this.config.statesTable){
			if(!this.configedChannels[this.getChannelId(element[this.internalIds.state])]){
				this.configedChannels[this.getChannelId(element[this.internalIds.state])] = {};
				this.configedChannels[this.getChannelId(element[this.internalIds.state])].name = element[this.internalIds.state];
				this.configedChannels[this.getChannelId(element[this.internalIds.state])].resetCronJob = element[this.internalIds.resetCronJob];
			}
			else{
				this.log.warn(`The id for "${element[this.internalIds.state]}" cound not be created. It is the same as "${this.configedChannels[this.getChannelId(element[this.internalIds.state])].name}".`);
			}
		}

		// delete not configutred states
		this.delNotConfiguredStates();

		// Create configured states if not created
		await this.createInternalStates();

		// Subscribe all internal states
		this.subscribeStates("*");

		// countup the enabled channels
		this.counting();

		// create cronJobs
		this.createCronJbs();
	}


	// deletes not configured states
	async delNotConfiguredStates()
	{
		// Get all objects in the adapter (later)
		this.AdapterObjectsAtStart = await this.getAdapterObjectsAsync();
		let activeString = "";
		for(const channel in this.configedChannels){
			// Operating hours löschen
			for(const state in this.operatingHours){
				activeString = `${this.namespace}.${channel}.${this.channelFolders.operatingHours}.${state}`;
				delete this.AdapterObjectsAtStart[activeString];
			}
			activeString = `${this.namespace}.${channel}.${this.channelFolders.operatingHours}`;
			delete this.AdapterObjectsAtStart[activeString];

			// Administrative löschen
			for(const state in this.administrative){
				activeString = `${this.namespace}.${channel}.${this.channelFolders.administrative}.${state}`;
				delete this.AdapterObjectsAtStart[activeString];
			}
			activeString = `${this.namespace}.${channel}.${this.channelFolders.administrative}`;
			delete this.AdapterObjectsAtStart[activeString];

			// Channel löschen
			activeString = `${this.namespace}.${channel}`;
			delete this.AdapterObjectsAtStart[activeString];
		}

		// delete the remaining states
		for(const state in this.AdapterObjectsAtStart){
			this.delObjectAsync(state);
		}
	}

	// creates internal states
	async createInternalStates(){
		for(const channel in this.configedChannels){
			// create channel
			await this.setObjectNotExistsAsync(`${channel}`,{
				type:"channel",
				common:{
					name: this.configedChannels[channel].name
				},
				native : {},
			});
			if(!this.configedChannels[channel][this.internalIds.timestamp]){
				this.configedChannels[channel][this.internalIds.timestamp] = {};
			}
			this.configedChannels[channel].timestamp = Date.now();
			// create operating hours folder
			await this.setObjectNotExistsAsync(`${channel}.${this.channelFolders.operatingHours}`,{
				type:"folder",
				common:{
					name: this.channelFolders.operatingHours
				},
				native : {},
			});
			if(!this.configedChannels[channel][this.channelFolders.operatingHours]){
				this.configedChannels[channel][this.channelFolders.operatingHours] ={};
			}

			// Create operating hour states
			for( const operatinghour of Object.values(this.operatingHours)){
				await this.setObjectNotExistsAsync(`${channel}.${this.channelFolders.operatingHours}.${operatinghour.name}`,{
					type: "state",
					common: {
						name: operatinghour.name,
						type: operatinghour.type,
						role: "value",
						read: true,
						write: operatinghour.write,
						unit: operatinghour.unit,
						def:operatinghour.def
					},
					native: {},
				});
				if(!this.configedChannels[channel][this.channelFolders.operatingHours][operatinghour.name]){
					this.configedChannels[channel][this.channelFolders.operatingHours][operatinghour.name] ={};
				}
				const state = await this.getStateAsync(`${channel}.${this.channelFolders.operatingHours}.${operatinghour.name}`);
				if(state){
					this.configedChannels[channel][this.channelFolders.operatingHours][operatinghour.name] = state.val;
				}
				else{
					this.configedChannels[channel][this.channelFolders.operatingHours][operatinghour.name] = 0;
				}
			}

			// create administrative folder
			await this.setObjectNotExistsAsync(`${channel}.${this.channelFolders.administrative}`,{
				type:"folder",
				common:{
					name: this.channelFolders.administrative
				},
				native : {},
			});
			if(!this.configedChannels[channel][this.channelFolders.administrative]){
				this.configedChannels[channel][this.channelFolders.administrative] ={};
			}
			// Create administrative states
			for( const administrative of Object.values(this.administrative)){
				await this.setObjectNotExistsAsync(`${channel}.${this.channelFolders.administrative}.${administrative.name}`,{
					type: "state",
					common: {
						name: administrative.name,
						type: administrative.type,
						role: "value",
						read: true,
						write: administrative.write,
						def: administrative.def
					},
					native: {},
				});
				if(!this.configedChannels[channel][this.channelFolders.administrative][administrative.name]){
					this.configedChannels[channel][this.channelFolders.administrative][administrative.name] ={};
				}
				const state = await this.getStateAsync(`${channel}.${this.channelFolders.administrative}.${administrative.name}`);
				if(state){
					this.configedChannels[channel][this.channelFolders.administrative][administrative.name] = state.val;
				}
				else{
					this.configedChannels[channel][this.channelFolders.administrative][administrative.name] = administrative.def;
				}
			}

		}
	}

	// Count the operatinghours
	counting(){
		let countingEnabled = false;
		const timestamp = Date.now();
		if(this.timeouts.countingTimeout){
			this.clearTimeout(this.timeouts.countingTimeout);
			delete this.timeouts.countingTimeout;
		}
		for(const channel in this.configedChannels){
			const channelObj = this.configedChannels[channel];
			if(channelObj.administrative.enableCounting){
				// Aktivierung des späteren timeout aufrufes
				countingEnabled = true;
				this.setOperatingHours(channel, channelObj.operatingHours.milliseconds + (timestamp - channelObj.timestamp), timestamp);
			}
		}
		if(countingEnabled){
			this.timeouts.countingTimeout = setTimeout(this.counting.bind(this),this.config.refreshRate);
		}
	}

	// Get the channel id in caseof the text implements not allowed characters
	getChannelId(configedId){
		return (configedId || "").replace(this.FORBIDDEN_CHARS, "_").replace(/[-\s]|\.$/g, "_");
	}

	// Set operatinghours (all formats in case of the milliseconds)
	setOperatingHours(channel,milliseconds,ts){
		// Berechenn der Werte
		const seconds = milliseconds/1000;
		const minutes = milliseconds/60000;
		const hours = milliseconds/3600000;
		const days = milliseconds/86400000;

		// Erzeugen der Strings mit Stunden
		const hourlength = Math.trunc(hours).toString().length;
		let hourstring = "00";
		let hourindex = 2;
		for(hourindex; hourindex < hourlength; hourindex++){
			hourstring += "0";
		}
		const h_m = (hourstring + Math.trunc(hours).toString()).slice(-hourindex) + ":" + ("00" + Math.trunc((minutes%60)).toString()).slice(-2);
		const h_m_s = h_m + ":" + ("00" + Math.trunc((seconds%60)).toString()).slice(-2);

		// Erzeugen des String mit Tagen
		const hourlengthWithDays = Math.trunc(hours%24).toString().length;
		let hourstringWithDays = "00";
		let hourindexWithDays = 2;
		for(hourindexWithDays; hourindexWithDays < hourlengthWithDays; hourindexWithDays++){
			hourstringWithDays += "0";
		}
		const h_mWithDays = (hourstringWithDays + Math.trunc(hours%24).toString()).slice(-hourindexWithDays) + ":" + ("00" + Math.trunc((minutes%60)).toString()).slice(-2);
		const h_m_sWithDays = h_mWithDays + ":" + ("00" + Math.trunc((seconds%60)).toString()).slice(-2);

		const daylength = Math.trunc(days).toString().length;
		let daystring = "00";
		let dayindex = 2;
		for(dayindex; dayindex < daylength; dayindex++){
			daystring += "0";
		}
		const d_h_m_s = (daystring + Math.trunc(days).toString()).slice(-dayindex) + ":" + h_m_sWithDays;

		// Erzeugen des Json Objekts für den JSON-String
		const json = {};
		let internalMillisecons = milliseconds;
		if(Math.trunc(days) > 0){
			internalMillisecons -= Math.trunc(days) * 86400000;
			json.days = Math.trunc(days);
		}
		else{
			json.days = 0;
		}
		if(Math.trunc(hours%24) > 0){
			internalMillisecons -= Math.trunc(hours%24) * 3600000;
			json.hours = Math.trunc(hours%24);
		}
		else{
			json.hours = 0;
		}
		if(Math.trunc(minutes%60) > 0){
			internalMillisecons -= Math.trunc(minutes%60) * 60000;
			json.minutes = Math.trunc(minutes%60);
		}
		else{
			json.minutes = 0;
		}
		if(Math.trunc(seconds%60) > 0){
			internalMillisecons -= Math.trunc(seconds%60) * 1000;
			json.seconds = Math.trunc(seconds%60);
		}
		else{
			json.seconds = 0;
		}
		json.milliseconds = internalMillisecons;

		// Berechnen der mittleren Einschaltzeit
		const averageOnTimeSeconds = seconds / this.configedChannels[channel].administrative.activationCounter;
		const averageOnTimeMinutes = minutes / this.configedChannels[channel].administrative.activationCounter;
		const averageOnTimeHours = hours / this.configedChannels[channel].administrative.activationCounter;

		// Erzeugen der Strings mit Stunden
		const averagehourlength = Math.trunc(averageOnTimeHours).toString().length;
		let averagehourstring = "00";
		let averagehourindex = 2;
		for(averagehourindex; averagehourindex < averagehourlength; averagehourindex++){
			averagehourstring += "0";
		}
		const averageOnTime_h_m_s = (averagehourstring + Math.trunc(averageOnTimeHours).toString()).slice(-averagehourindex) + ":" + ("00" + Math.trunc((averageOnTimeMinutes%60)).toString()).slice(-2) + ":" + ("00" + Math.trunc((averageOnTimeSeconds%60)).toString()).slice(-2);

		// Schreiben der states
		this.configedChannels[channel].timestamp = ts;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.milliseconds.name}`,milliseconds,true);
		this.configedChannels[channel].operatingHours.milliseconds = milliseconds;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.seconds.name}`,seconds,true);
		this.configedChannels[channel].operatingHours.seconds = seconds;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.minutes.name}`,minutes,true);
		this.configedChannels[channel].operatingHours.minutes = minutes;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.hours.name}`,hours,true);
		this.configedChannels[channel].operatingHours.hours = hours;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.days.name}`,days,true);
		this.configedChannels[channel].operatingHours.days = days;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.timestring_h_m.name}`,h_m,true);
		this.configedChannels[channel].operatingHours.timestring_h_m = h_m;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.timestring_h_m_s.name}`,h_m_s,true);
		this.configedChannels[channel].operatingHours.timestring_h_m_s = h_m_s;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.timestring_d_h_m_s.name}`,d_h_m_s,true);
		this.configedChannels[channel].operatingHours.timestring_d_h_m_s = d_h_m_s;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.json.name}`,JSON.stringify(json),true);
		this.configedChannels[channel].operatingHours.json = json;
		this.setState(`${channel}.${this.channelFolders.operatingHours}.${this.operatingHours.averageOnTime_h_m_s.name}`,averageOnTime_h_m_s,true);
		this.configedChannels[channel].operatingHours.averageOnTime_h_m_s = averageOnTime_h_m_s;

		// Rücksetzen des counters, wenn die millesekunden 0 sind
		if(milliseconds === 0){
			if(this.configedChannels[channel].administrative.enableCounting){
				this.configedChannels[channel].administrative.activationCounter = 1;
			}
			else{
				this.configedChannels[channel].administrative.activationCounter =0;
			}
			this.setState(`${channel}.${this.channelFolders.administrative}.${this.administrative.activationCounter.name}`,this.configedChannels[channel].administrative.activationCounter ,true);
		}
	}


	createCronJbs(){
		for(const channel in this.configedChannels){
			if(	this.configedChannels[channel].resetCronJob !== null &&
				this.configedChannels[channel].resetCronJob !== ""){
				if(!this.cronJobs[this.configedChannels[channel].resetCronJob]){
					this.cronJobs[this.configedChannels[channel].resetCronJob] = {};
					this.cronJobs[this.configedChannels[channel].resetCronJob][this.jobId] = schedule.scheduleJob(this.configedChannels[channel].resetCronJob,this.resetWithCronJob.bind(this,this.configedChannels[channel].resetCronJob));
					if(this.cronJobs[this.configedChannels[channel].resetCronJob][this.jobId]){
						this.log.debug(`cronjob ${this.configedChannels[channel].resetCronJob} was created.`);
					}
					else{
						this.log.warn(`reset cronjob ${this.configedChannels[channel].resetCronJob} for the state ${channel} can not be created.`);
					}
				}
				this.cronJobs[this.configedChannels[channel].resetCronJob][channel] = {};
			}
		}
	}

	resetWithCronJob(cronJob){
		const timestamp = Date.now();
		for(const ele in this.cronJobs[cronJob]){
			if(ele != this.jobId){
				this.setOperatingHours(ele,  0, timestamp);
			}
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// clear all schedules
			for(const cronJob in this.cronJobs)
			{
				schedule.cancelJob(this.cronJobs[cronJob][this.jobId]);
			}
			this.clearAllTimeouts();
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// Es werden nur Werte beachtet, welche mit ack = false geschrieben wurden.
			if(!state.ack){
				let newId = id.substring(this.namespace.length,id.length);
				// Vorletzten punkt heraus finden
				let beforeLastIndex = this.namespace.length;
				while(newId.indexOf(".") !== newId.lastIndexOf(".")){
					beforeLastIndex += newId.indexOf(".") + 1;
					newId = id.substring(beforeLastIndex,id.length);
				}
				// Endung der id und den channel herausfiltern
				const idExtention = id.substring(beforeLastIndex,id.length);
				const channel = id.substring(this.namespace.length + 1,beforeLastIndex - 1); // -1, wegen dem letzten Punkt für die foldertrennung
				// Prüfen, ob das enableCounting geändert wurde
				if(idExtention.indexOf(this.administrative.enableCounting.name) !== -1){
					// Zuweisen des neuen States
					const lastState = this.configedChannels[channel][this.channelFolders.administrative].enableCounting;
					this.configedChannels[channel][this.channelFolders.administrative].enableCounting = state.val;
					this.setState(`${channel}.${this.channelFolders.administrative}.${this.administrative.enableCounting.name}`,state.val,true);

					// Abfrage, ob sich der Wert geändert hat (Nur dann, wir etwas unternommen)
					if(state.val !== lastState){
						// Abfrage, ob der neue Wert true ist
						if(state.val){
							// Hochzählen des aktivierungscounters
							this.configedChannels[channel].administrative.activationCounter += 1;
							this.setState(`${channel}.${this.channelFolders.administrative}.${this.administrative.activationCounter.name}`,this.configedChannels[channel].administrative.activationCounter,true);
							this.configedChannels[channel].timestamp = state.ts;
							if(!this.timeouts.countingTimeout){
								this.timeouts.countingTimeout = setTimeout(this.counting.bind(this),this.config.refreshRate);
							}
						}
						else{
							if(this.timeouts.countingTimeout){
								this.clearTimeout(this.timeouts.countingTimeout);
								delete this.timeouts.countingTimeout;
							}
							this.counting();
							this.setOperatingHours(channel, this.configedChannels[channel].operatingHours.milliseconds + (state.ts - this.configedChannels[channel].timestamp), state.ts);
						}
					}
				}

				// Prüfen, ob sich ein Betriebsstundenzähler geändert hat
				else if(idExtention.indexOf(this.channelFolders.operatingHours) !== -1){
					// Nun wird noch geprüft,welcher Betriebsstundenwert geändert wurde => Somitkann dieser in ms umgerechnet werden.
					let milliseconds = 0;
					if(typeof(state.val) === "number"){ // auf den Type number prüfen
						if(newId.indexOf(this.operatingHours.milliseconds.name) !== -1){
							milliseconds = state.val;
						}
						else if(newId.indexOf(this.operatingHours.seconds.name) !== -1){
							if(state.val !== null){
								milliseconds = state.val * 1000;
							}
						}
						else if(newId.indexOf(this.operatingHours.minutes.name) !== -1){
							if(state.val !== null){
								milliseconds = state.val * 60000;
							}
						}
						else if(newId.indexOf(this.operatingHours.hours.name) !== -1){
							if(state.val !== null){
								milliseconds = state.val * 3600000;
							}
						}
						else if(newId.indexOf(this.operatingHours.days.name) !== -1){
							if(state.val !== null){
								milliseconds = state.val * 86400000;
							}
						}
						this.setOperatingHours(channel,milliseconds,state.ts);
					}
				}
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	onMessage(obj) {
		if (typeof obj === "object" && obj.message) {
			if(obj.command === "getOperatingHours"){
				if(this.configedChannels[obj.message.name]){
					const timestamp = Date.now();
					const milliseconds = this.configedChannels[obj.message.name].operatingHours.milliseconds + (timestamp - this.configedChannels[obj.message.name].timestamp);
					const seconds = milliseconds/1000;
					const minutes = milliseconds/60000;
					const hours = milliseconds/3600000;
					const days = milliseconds/86400000;
					const data = {messagestate: "ok", milliseconds: milliseconds, seconds: seconds, minutes:minutes, hours: hours, days: days};
					this.sendTo(obj.from, obj.command, data, obj.callback);
				}
				else{
					if(obj.callback){
						const data = {messagestate: "error", errormessge: `no valid statename received: ${obj.message.name}`};
						this.sendTo(obj.from, obj.command, data, obj.callback);
					}
				}
			}
			else{
				if(obj.callback){
					const data = {messagestate: "error", errormessge: `no valid command received: ${obj.command}`};
					this.sendTo(obj.from, obj.command, data, obj.callback);
				}
			}
		}
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new OperatingHours(options);
} else {
	// otherwise start the instance directly
	new OperatingHours();
}