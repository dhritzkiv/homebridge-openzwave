import { Subscription } from 'rxjs'
import { filter, first } from 'rxjs/operators'
import { Homebridge } from '../../types/homebridge'
import BoundValueStream from '../Streams/BoundValueStream'
import exactlyOnce from '../Support/exactlyOnce'
import { IValueTransformer } from './Transformers/IValueTransformer'
import noopValueTransformer from './Transformers/noopValueTransformer'
import { ValueType } from './ValueType'

export type CoordinateValuesParams = {
	log: Homebridge.Logger
	characteristic: HAPNodeJS.Characteristic
	valueStream: BoundValueStream
	readonly?: boolean
	listening: boolean
	transformer?: IValueTransformer
}

type HomeKitCallback = (error: Error | null, value?: ValueType) => void

// Coordinates value streams from both Zwave and HomeKit for a single Characteristic
export default class ValueCoordinator {
	readonly log: Homebridge.Logger
	readonly characteristic: HAPNodeJS.Characteristic
	readonly valueStream: BoundValueStream
	readonly transformer: IValueTransformer
	readonly readonly: boolean
	readonly listening: boolean
	private valueUpdateObserver?: Subscription

	constructor({
		log,
		characteristic,
		valueStream,
		readonly,
		listening,
		transformer,
	}: CoordinateValuesParams) {
		this.log = log
		this.characteristic = characteristic
		this.valueStream = valueStream
		this.readonly = listening === false || (readonly ?? false)
		this.listening = listening
		this.transformer = transformer ?? noopValueTransformer()

		if (!this.transformer.homekitToZwave && !this.readonly) {
			throw new Error('homekitToZwave is required for readwrite values')
		}
	}

	start() {
		let valueUpdate = this.valueStream.valueObservable

		if (this.transformer.isZwaveValid) {
			valueUpdate = valueUpdate.pipe(filter(value => this.transformer.isZwaveValid!(value)))
		}

		// Subscribe to all value updates and forward them to HomeKit
		let hadInitialValue = false
		this.valueUpdateObserver = valueUpdate.subscribe(value => {
			this.sendZwaveValueToHomeKit(value)
			hadInitialValue = true
		})

		// If we didn’t immediately load a value, refresh
		if (!hadInitialValue) {
			this.valueStream.refresh('No initial value on startup')
		}

		// Handle explicit HomeKit value setting
		if (this.readonly !== true) {
			this.characteristic.on('set', (newValue: ValueType, callback: HomeKitCallback) => {
				this.sendHomeKitValueToZwave(newValue, exactlyOnce(callback, this.log))
			})
		}

		// Handle explicit HomeKit value requests
		this.characteristic.on('get', (callback: HomeKitCallback) => {
			let didReceiveValue = false
			callback = exactlyOnce(callback, this.log)

			// valueUpdate is a ReplaySubject, so we can respond
			// with the last cached value instantly
			valueUpdate
				.pipe(first())
				.subscribe(value => {
					didReceiveValue = true
					this.sendZwaveValueToHomeKit(value, callback)
				})
				.unsubscribe()

			if (!this.listening && !didReceiveValue) {
				callback(new Error('Unable to request value'))
			} else {
				// However, we still want to grab the fresh value from
				// the device, so we’ll request a refresh and that will
				// be sent to HomeKit once it’s resolved
				this.refreshZwaveValue('HomeKit requested')
			}
		})
	}

	stop() {
		this.valueUpdateObserver?.unsubscribe()
		this.valueUpdateObserver = undefined
	}

	private sendZwaveValueToHomeKit(value: ValueType, callback?: HomeKitCallback) {
		const homekitValue = this.transformer.zwaveToHomeKit(value)
		this.log.debug(
			`sendZwaveValueToHomeKit via ${callback ? 'callback' : 'updateValue'}`,
			homekitValue,
		)

		setImmediate(() => {
			if (callback) {
				callback(null, homekitValue)
			} else {
				this.characteristic.updateValue(homekitValue)
			}
		})
	}

	private sendHomeKitValueToZwave(homekitValue: ValueType, callback: (error?: Error) => void) {
		if (this.readonly === true) {
			return
		}

		if (this.transformer.isHomekitValid && !this.transformer.isHomekitValid!(homekitValue)) {
			return
		}

		// NOTE: Constructor ensures homekitToZwave is available
		const zwaveValue = this.transformer.homekitToZwave!(homekitValue)
		this.log.debug('sendHomeKitValueToZwave', zwaveValue)

		this.valueStream
			.setThenRefresh(zwaveValue, 5000)
			.then(() => callback())
			.catch(callback)
	}

	private refreshZwaveValue(reason: String) {
		if (!this.listening) {
			this.log.debug('Refusing to refresh value for non-listening device')
			return
		}

		this.valueStream.refresh(reason)
	}
}
